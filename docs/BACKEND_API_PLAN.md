# План изменений бэкенда: REST API + авторизация (для веб-приложения)

> Отдельный документ к [`WEB_PLAN.md`](WEB_PLAN.md): описывает, что нужно сделать в
> Go-бэкенде, чтобы фронтенд стал самостоятельным сервисом.
> Целевая архитектура — **два отдельных сервиса**: `bot` (Telegram) и `api` (REST),
> разделяющие доменный слой, сервисный слой и репозитории (общая PostgreSQL).
> Начинаем с API внутри существующего процесса (быстро, без инфраструктурного скачка),
> затем выносим в отдельный бинарник `cmd/api`.

## 1. Что уже есть и можно переиспользовать

| Слой | Статус |
|---|---|
| `internal/service/todo` | Готов: вся бизнес-логика, завязана на `userID int64`. REST переиспользует как есть |
| `internal/repository/todo` | Готов: PostgresStore + MemStore, интерфейсы в сервисе |
| `internal/errors` | Готов: sentinel-ошибки, маппятся на HTTP-статусы |
| `internal/worker/reminder`, `worker/pin` | Не зависят от Telegram API (порт `NotificationSender`) |

**Ключевой факт:** сейчас `user_id` в таблицах данных — это Telegram user_id напрямую.
Для независимых веб-аккаунтов это не подходит (коллизия id между веб-пользователем и
Telegram-пользователем приведёт к смешиванию данных) — вводится таблица `users` (§3).

## 2. Архитектурные решения

1. **HTTP — только `net/http`** (Go 1.22+ паттерны `METHOD /path`), без фреймворков.
   Middleware — обычные функции-обёртки.
2. **Пакеты по AGENTS.md**: `internal/handler/http/` (handler + dto), `internal/middleware/`,
   `internal/session/`, `internal/user/`.
3. **Интерфейсы на стороне потребителя**: `http`-handler определяет свой Service-интерфейс.
4. **Аутентификация**: логин + пароль (bcrypt), cookie-сессия (HttpOnly, SameSite=Lax).
   CSRF-токен не требуется: `SameSite=Lax` + личное приложение (опционально добавить позже).
5. **Аккаунты независимы от бота**: у веб-пользователя свой `users.id`; данные бота и веба
   изолированы (у каждого свой user_id в общих таблицах).
6. **API-контракт**: JSON, ошибки в едином формате `{"error": "..."}`, статусы из sentinel-ошибок.
7. **SPA-хостинг**: один процесс (или nginx) раздаёт статику и `/api/*` — без CORS.

## 3. Таблица `users` и миграция данных

### 3.1 Почему нужна миграция

Данные (notes, topics, folders, attachments, user_settings) привязаны к `user_id` = Telegram user_id.
Если веб-пользователи будут получать id из identity-последовательности, рано или поздно он совпадёт
с Telegram user_id → пользователи увидят чужие данные. Единственный чистый способ изолировать
аккаунты — единая таблица `users`, а во всех таблицах данных `user_id` становится ссылкой на `users.id`.

Данные бота **не теряются и не меняются по содержимому** — выполняется одноразовая перепривязка
с обязательным бэкапом (см. §3.3).

### 3.2 Схема

```sql
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      TEXT UNIQUE,          -- логин веб-пользователя (NULL у бот-пользователей)
    password_hash TEXT,                 -- bcrypt (NULL у бот-пользователей)
    telegram_id   BIGINT UNIQUE,        -- для бот-пользователей (NULL у веб-пользователей)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- Веб-пользователь: `username` + `password_hash` (из регистрации).
- Бот-пользователь: `telegram_id` (создаётся автоматически при первом обращении).

### 3.3 Миграция (одноразовая, с бэкапом)

Порядок (выполнять на остановленном или «тихом» боте; сначала `make db-backup`):

```sql
-- 1) Создать users для всех telegram user_id, встречающихся в данных
INSERT INTO users (telegram_id)
SELECT DISTINCT user_id FROM (
    SELECT user_id FROM topics UNION SELECT user_id FROM notes
    UNION SELECT user_id FROM folders UNION SELECT user_id FROM attachments
    UNION SELECT user_id FROM user_settings
) t
ON CONFLICT (telegram_id) DO NOTHING;

-- 2) Перепривязать данные: telegram user_id → users.id
UPDATE notes         SET user_id = u.id FROM users u WHERE notes.user_id         = u.telegram_id;
UPDATE topics        SET user_id = u.id FROM users u WHERE topics.user_id        = u.telegram_id;
UPDATE folders       SET user_id = u.id FROM users u WHERE folders.user_id       = u.telegram_id;
UPDATE attachments   SET user_id = u.id FROM users u WHERE attachments.user_id   = u.telegram_id;
UPDATE user_settings SET user_id = u.id FROM users u WHERE user_settings.user_id = u.telegram_id;
UPDATE user_quick_topics SET user_id = u.id FROM users u WHERE user_quick_topics.user_id = u.telegram_id;

-- 3) (Опционально, для защиты) FK users.id
ALTER TABLE notes ADD CONSTRAINT fk_notes_user FOREIGN KEY (user_id) REFERENCES users(id);
-- ... аналогично для topics, folders, attachments, user_settings, user_quick_topics
```

Миграцию оформить как скрипт `data/migrate_users.sql` + документированную команду
(или встроить в `schema` как идемпотентные `ALTER ... IF NOT EXISTS` и проверку).

### 3.4 Изменение бота (минимальное)

- В `handler/telegram` при обработке апдейта: `update.From.ID` → `userRepo.FindOrCreateByTelegramID(update.From.ID)` →
  вернуть `users.id`, который и передаётся в сервисный слой как `userID`.
- Добавить в PostgresStore/MemStore: `FindOrCreateByTelegramID`, `FindByUsername`, `CreateUser`.

## 4. Аутентификация (логин + пароль)

- Хеш пароля: **bcrypt** (`golang.org/x/crypto/bcrypt`, cost 12).
- Валидация: username — 3–32 символа `[a-z0-9_]` (нижний регистр); password — ≥8 символов.
- Сессия: токен 32 случайных байта (base64url), в БД хранится **SHA-256 хеш** токена.
- Cookie: `session`; `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=30d`.
- `POST /auth/login` и `/auth/register` при неудаче — 401/409 с `{"error": "..."}`.
- Ограничение попыток входа (простой счётчик по username/IP) — полировка, на MVP можно пропустить.

## 5. Новые пакеты и структура

```
cmd/
└── api/main.go                  # НОВЫЙ бинарник (этап 3; до этого — в cmd/bot/main.go)
internal/
├── handler/http/                # НОВОЕ: REST-транспорт
│   ├── router.go                #   mux, регистрация маршрутов, middleware-цепочка
│   ├── auth.go                  #   register / login / logout / me
│   ├── topics.go                #   CRUD топиков
│   ├── notes.go                 #   CRUD заметок
│   └── dto/                     #   request.go / response.go / converter.go
├── middleware/                  # НОВОЕ
│   ├── auth.go                  #   cookie → userID в context (401 без валидной сессии)
│   ├── logging.go               #   slog: метод, путь, статус, длительность
│   └── recover.go               #   panic → 500, без падения процесса
├── session/                     # НОВОЕ: хранение веб-сессий
│   ├── session.go               #   Session {TokenHash, UserID, ExpiresAt} + интерфейс Store
│   ├── memory.go                #   in-memory реализация
│   └── postgres.go              #   Postgres-реализация (таблица web_sessions)
├── user/                        # НОВОЕ: пользователи
│   ├── user.go                  #   User {ID, Username, PasswordHash, TelegramID}
│   └── (репозиторий в repository/todo — интерфейс на стороне потребителя)
└── repository/todo/             # ДОПОЛНИТЬ
    ├── users.go                 #   FindOrCreateByTelegramID / FindByUsername / CreateUser
    └── postgres.go              #   таблица web_sessions (или отдельный session store)
```

## 6. REST API (контракт, MVP)

Префикс: `/api/v1`. Все маршруты, кроме `/auth/*`, требуют сессию.
`userID` извлекается middleware'ом из cookie и прокидывается через `context`.

### Auth
| Метод | Путь | Описание | Тело → Ответ |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Регистрация | `{username, password}` → 201 `{user}` + Set-Cookie |
| POST | `/api/v1/auth/login` | Вход | `{username, password}` → 200 `{user}` + Set-Cookie |
| POST | `/api/v1/auth/logout` | Выход | — → 204 |
| GET | `/api/v1/me` | Профиль | → `{user: {id, username}}` |

Ответ `user`: `{id, username}`. Ошибки: `409` (username занят), `401` (неверный логин/пароль).

### Topics
| Метод | Путь | Описание | Тело → Ответ |
|---|---|---|---|
| GET | `/api/v1/topics` | Все топики | → `[{id, name, note_count}]` |
| POST | `/api/v1/topics` | Создать | `{name}` → 201 `{id, name}` |
| PATCH | `/api/v1/topics/{id}` | Переименовать | `{name}` → 200 `{id, name, note_count}` |
| DELETE | `/api/v1/topics/{id}` | Удалить (с заметками) | — → 204 |

> `note_count` — через существующий `Service.CountNotes`. Порядок топиков — как у бота (по id).
> Переименование переиспользует существующий метод бота (аналог `/settopic`) — это требование
> фронта (долгий тап по табу в `docs/WEB_PLAN.md`, этап 2), добавлено в контракт 2026-08-21.

### Notes
| Метод | Путь | Описание | Тело → Ответ |
|---|---|---|---|
| GET | `/api/v1/notes?topic_id=N` | Список заметок топика (сортировка как у бота: pinned → priority → done в конце) | → `[{id, text, priority, done, pinned, created_at, reminder_at, reminder_repeat}]` |
| POST | `/api/v1/notes` | Создать | `{topic_id, text}` → 201 Note |
| PATCH | `/api/v1/notes/{id}` | Частичное обновление | `{text?, done?, priority?, pinned?, archived?}` → 200 Note |
| DELETE | `/api/v1/notes/{id}` | Удалить | — → 204 |
| POST | `/api/v1/notes/{id}/move` | Переместить в топик/папку | `{topic_id, folder_id?}` → 200 Note |
| PUT | `/api/v1/notes/{id}/reminder` | Установить/перенести напоминание | `{at, repeat}` → 200 Note |
| DELETE | `/api/v1/notes/{id}/reminder` | Снять напоминание | — → 200 Note |

- `priority`: строка `"none" | "low" | "medium" | "high"` (конвертер в `model.Priority`).
- `done`: `true`/`false` (методы `MarkDone`/`MarkUndone`); `done: true` сбрасывает напоминание.
- `text` при PATCH: редактирование; `entities` не передаются (MVP) — форматирование сбрасывается
  (см. ограничение в §8).
- `reminder_at`: ISO 8601 (RFC3339, UTC), `null` — напоминания нет. `reminder_repeat`:
  `"once" | "daily"` (Value Object `model.ReminderRepeat`).
- `at` при PUT: ISO 8601 (RFC3339); одноразовое (`once`) напоминание должно быть в будущем —
  иначе 400 (валидация как в боте). Для `daily` проверки прошлого нет.
- Снятие напоминания (`DELETE reminder`) возвращает актуальную заметку (не 204).
- Ответ всегда возвращает актуальный объект (для оптимистичных обновлений на фронте).
- Доставка напоминаний — через Telegram-бота: воркер `internal/worker/reminder` (интервал 30с)
  запускается только в `cmd/bot/main.go`, REST-эндпоинты лишь пишут `reminder_at`/`reminder_repeat`.

## 7. Схема БД (дополнить `schema` в postgres.go)

```sql
CREATE TABLE IF NOT EXISTS web_sessions (
    token_hash TEXT PRIMARY KEY,      -- SHA-256 сессионного токена
    user_id    BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_web_sessions_user ON web_sessions(user_id);
```

Таблица `users` и миграция — §3. Очистка просроченных сессий — лёгкий фоновый тикер (полировка).

## 8. Ограничения MVP (осознанно)

- **Форматирование**: веб-заметки создаются plain text (`entities = nil`). При редактировании
  из веба заметки с форматированием (созданной в боте) entities сбрасываются. Приемлемо для
  прототипа; позже — сохранять старые entities при правке только текста.
- **Папки, напоминания, вложения, настройки** — эндпоинты не добавляем (вне скоупа MVP).
- **Пагинация заметок** — весь список сразу; «ещё/скролл» — при расширении.
- **CSRF** — не вводим (SameSite=Lax, личное приложение); зафиксировать решение.
- **Rate limit на login** — полировка, не MVP.

## 9. Конфигурация (`.env`)

| Переменная | Обязательная | Описание |
|---|---|---|
| `HTTP_ADDR` | Нет | Адрес HTTP-сервера (по умолчанию `:8080`) |
| `SESSION_TTL` | Нет | Время жизни сессии (по умолчанию 30d) |
| `APP_BASE_URL` | Нет | Публичный домен (для корректных Set-Cookie при деплое) |

## 10. Этапы реализации

### Этап 0. Инфраструктура HTTP внутри существующего процесса
- [ ] Пакеты `internal/handler/http/`, `internal/middleware/`; router + health (`GET /healthz`)
- [ ] `http.Server` в `cmd/bot/main.go` (горутина, graceful shutdown как у бота)
- [ ] Middleware: logging, recover
- [ ] Единый формат ошибок и маппинг sentinel → статус (404/400/401/500)

**Done:** `curl :8080/healthz` отвечает; формат ошибок единый.

### Этап 1. Пользователи, авторизация, сессии
- [ ] Таблица `users` + миграция данных бота (§3) с бэкапом
- [ ] `repository/todo/users.go`: `CreateUser`, `FindByUsername`, `FindOrCreateByTelegramID`
- [ ] `internal/user/`, `internal/session/` (memory + postgres, таблица `web_sessions`)
- [ ] bcrypt: генерация и проверка хеша; валидация username/password
- [ ] `POST /auth/register|login|logout`, `GET /me`; middleware auth (cookie → userID)
- [ ] Бот: переход на `FindOrCreateByTelegramID` (§3.4)
- [ ] E2E: register → login → me → logout; ошибки (занятый username, неверный пароль)

**Done:** полный цикл регистрации/входа; сессия в БД; бот работает через `users.id`.

### Этап 2. Топики и заметки (CRUD)
- [ ] DTO + конвертеры (domain → response), маппинг `priority` строка ↔ `model.Priority`
- [ ] `GET/POST/PATCH/DELETE /topics` (с `note_count`; PATCH — переименование через существующий метод бота)
- [ ] `GET /notes?topic_id`, `POST /notes`, `PATCH /notes/{id}`, `DELETE /notes/{id}`
- [ ] Валидация body (json decode, обязательные поля) → 400
- [ ] Тесты: handler-юниты (мок сервиса) + e2e через httptest

**Done:** фронт (этапы 1–3 WEB_PLAN) работает с полным CRUD.

### Этап 3. Отдельный сервис `cmd/api` (+ деплой)
- [ ] Вынести HTTP-часть в `cmd/api/main.go` (ручной DI: те же репозитории, свой слушатель)
- [ ] `docker-compose.yml`: сервисы `bot` и `api` (общий `db`); `web` — nginx (статик + прокси `/api` → `api:8080`)
- [ ] HTTPS (Caddy/nginx), `APP_BASE_URL` в конфигах
- [ ] Обновить README (переменные, команды), CHANGELOG

**Done:** три независимых контейнера: `web`, `api`, `bot` (+ `db`); `docker compose up` поднимает всё.

## 11. Тестирование

- [ ] Юнит: bcrypt-хелперы, валидация username/password
- [ ] Юнит: маппинг ошибок, конвертеры DTO (priority, note)
- [ ] Юнит: session store (memory + postgres), истечение TTL
- [ ] Юнит: `FindOrCreateByTelegramID` (создание только при первом обращении)
- [ ] E2E (`internal/tests/`): полный цикл через `httptest.NewServer` — register → login →
      create topic → create/edit/done/delete note → logout; повторный вход по cookie
- [ ] `make lint`, `make tests` зелёные

## 12. Антипаттерны (не делать)

- [ ] НЕ добавлять CORS — один домен, не нужен
- [ ] НЕ класть Telegram-специфику (tgbotapi) в http-хендлеры и DTO
- [ ] НЕ вводить ORM/роутеры/DI-фреймворки — только stdlib + bcrypt
- [ ] НЕ дублировать логику сортировки заметок — переиспользовать `svc.ListNotes`
- [ ] НЕ хранить пароли и сессионные токены открыто — bcrypt / SHA-256 хеши
- [ ] НЕ разрешать веб-пользователю user_id, пересекающийся с Telegram user_id
      (миграция §3 — обязательна, это не «можно и так»)
- [ ] НЕ добавлять эндпоинты вне скоупа MVP без явного запроса (папки/напоминания/вложения — позже)
