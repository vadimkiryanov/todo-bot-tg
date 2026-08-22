# todo-bot-tg

Персональный таск-менеджер: **Telegram-бот** (Go) + **веб-приложение** (PWA) на общей PostgreSQL.

Бот позволяет управлять заметками прямо в чате: создавать, редактировать, выполнять (✅), архивировать, задавать приоритеты, распределять по топикам и вложенным папкам, перемещать между ними, устанавливать напоминания с повтором. Интерфейс построен на inline-кнопках с хлебными крошками — вся навигация происходит в одном сообщении.

Веб-приложение — самостоятельный сервис с отдельными аккаунтами (логин + пароль): топики и заметки через REST API, дизайн в стиле Telegram-чата (табы топиков сверху, список заметок, поле ввода снизу), PWA с офлайн-поддержкой и тёмной темой.

## Возможности

- **Заметки** — создание, редактирование текста (через `SwitchInlineQueryCurrentChat`), удаление, архивация/разархивация. Пагинация по 10 штук. Сортировка: высокий приоритет → средний → без → низкий, выполненные в конце.
- **Топики** — категоризация заметок по темам (например, «Личное», «Работа»). Создание, удаление, переключение активного топика. Авто-сид демо-заметок при первом `/start`.
- **Папки** — вложенные папки внутри топиков для группировки заметок. Навигация по дереву папок, перемещение заметок между топиками и папками.
- **Выполненные** — отметка «✅» с зачёркиванием текста (Unicode U+0336). Виртуальная папка «✅ Выполненные» с отдельным просмотром.
- **Приоритеты** — четыре уровня: без приоритета, низкий (🔵), средний (🟡), высокий (🔴). Выбор при создании, циклическое переключение при просмотре.
- **Напоминания** — установка даты и времени через интерактивный календарь (месяц → день → час → минуты) с кнопками «Сегодня»/«Завтра». Поддержка ежедневного повтора. Фоновый воркер (каждые 30 секунд).
- **Вложения 📎** — к заметкам можно прикреплять файлы: фото, документы, аудио, видео, голосовые, видео-сообщения, анимации и стикеры. Список вложений — кнопками, просмотр в едином окне с кнопкой «❌ Закрыть» (окно автоудаляется при выходе из заметки), удаление с подтверждением. Простое прикрепление: файл, отправленный после открытия заметки, прикрепляется к ней без кнопки 📎; прикрепление через 📎 оставляет пользователя в списке вложений. Файлы хранятся на диске.
- **Навигация** — хлебные крошки с эмодзи, счётчики заметок и папок, компактная кнопка «⚙️» для действий с заметкой.
- **Бэкап** — команда `/backup` дампит базу и отправляет SQL-файл прямо в чат.
- **Reply-клавиатура** — быстрые кнопки «📝 Список» и «📂 Топики».

## Стек

| Компонент | Технология |
|---|---|
| Язык | Go 1.25 |
| Telegram API | [go-telegram-bot-api/v5](https://github.com/go-telegram-bot-api/telegram-bot-api) |
| REST API | stdlib `net/http` (Go 1.22+ паттерны `METHOD /path`), cookie-сессии, bcrypt |
| База данных | PostgreSQL 16 ([pgx/v5](https://github.com/jackc/pgx)) |
| Веб-фронтенд | Vite + Svelte 5 + Tailwind v4 (PWA, `web/`) |
| Веб-сервер | [Caddy](https://caddyserver.com/) — статика + прокси `/api`, авто-HTTPS |
| Конфигурация | `.env` + [godotenv](https://github.com/joho/godotenv) |
| Контейнеризация | Docker (multi-stage) + docker-compose (4 сервиса: `web`, `api`, `bot`, `db`) |

## Быстрый старт

### Локальная разработка (in-memory)

```bash
# Клонировать репозиторий
git clone https://github.com/vadimkiryanov/todo-bot-tg.git
cd todo-bot-tg

# Создать .env с токеном бота
echo 'TELEGRAM_BOT_TOKEN=123456:YOUR_TOKEN' > .env

# Запустить (без DATABASE_URL — in-memory хранилище)
make run
```

### Локально с PostgreSQL

```bash
# Установить DATABASE_URL в .env
echo 'DATABASE_URL=postgres://botuser:botpass@localhost:5432/todobot?sslmode=disable' >> .env

# Поднять PostgreSQL
make db-up

# Запустить бота
make run
```

### Docker Compose

```bash
# Создать .env с токеном и DATABASE_URL
cat > .env << 'EOF'
TELEGRAM_BOT_TOKEN=123456:YOUR_TOKEN
DATABASE_URL=postgres://botuser:botpass@db:5432/todobot?sslmode=disable
EOF

# Запустить
docker compose up -d --build
```

Поднимаются четыре сервиса: `db` (PostgreSQL), `api` (REST API, `cmd/api`), `bot` (Telegram-бот),
`web` (Caddy — статика Svelte + прокси `/api/*` на `api:8080`). Веб доступен на `http://localhost`
(или `https://ваш-домен` при заданном `APP_BASE_URL` — Caddy получит сертификат Let's Encrypt сам).

### Веб-приложение и REST API

Веб-фронтенд (в `web/`) — самостоятельный сервис с собственными аккаунтами (логин + пароль):
`/api/v1/auth/register|login|logout`, `GET /api/v1/me`, CRUD топиков и заметок
(`/api/v1/topics`, `/api/v1/notes`). Аккаунты веба и бота независимы (единая таблица `users`,
у каждого свой `user_id`). Подробный контракт — в [`docs/BACKEND_API_PLAN.md`](docs/BACKEND_API_PLAN.md),
фронтенд — в [`docs/WEB_PLAN.md`](docs/WEB_PLAN.md) и `web/AGENTS.md`.

REST API можно запустить отдельным процессом (без бота):

```bash
make api          # go run ./cmd/api/ — in-memory или с DATABASE_URL
```

## Переменные окружения

| Переменная | Обязательная | Описание |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Для бота | Токен бота от [@BotFather](https://t.me/BotFather) |
| `DATABASE_URL` | Нет | PostgreSQL DSN. Если не задан — используется in-memory хранилище |
| `FILES_DIR` | Нет | Каталог для файлов вложений (по умолчанию `data/files`) |
| `HTTP_ADDR` | Нет | Адрес HTTP-сервера REST API (по умолчанию `:8080`; пусто — HTTP не запускается) |
| `SESSION_TTL` | Нет | Срок жизни веб-сессии (Go duration, по умолчанию `720h` = 30 дней) |
| `APP_BASE_URL` | Нет | Домен веб-приложения для Caddy: `example.com` — авто-HTTPS (Let's Encrypt), `:80` — HTTP |

## Makefile

| Команда | Описание |
|---|---|
| `make build` | Собрать бинарники бота и API → `bin/todobot`, `bin/todoapi` |
| `make run` | Запустить бота (`go run ./cmd/bot/`) |
| `make api` | Запустить REST API (`go run ./cmd/api/`) |
| `make db-up` | Поднять PostgreSQL в Docker |
| `make db-down` | Остановить PostgreSQL |
| `make db-reset` | Пересоздать контейнер с БД |
| `make db-backup` | Сделать дамп базы |
| `make db-restore FILE=backup.sql` | Восстановить из дампа |

## Деплой на сервер

```bash
# На Ubuntu-сервере:
git clone https://github.com/vadimkiryanov/todo-bot-tg.git
cd todo-bot-tg

# Создать .env вручную (deploy.sh упадёт без него)
nano .env

# Запустить деплой
bash deploy.sh
```

`deploy.sh` установит Docker и git (если отсутствуют), проверит наличие `.env` и запустит `docker compose up -d --build`. Файл `.env` никогда не перезаписывается скриптом.

Для HTTPS на сервере задай в `.env` домен:

```
APP_BASE_URL=todo.example.com   # A-запись домена должна указывать на сервер (порт 80/443 открыты)
```

Caddy сам получит и обновит сертификат Let's Encrypt (нужны открытые порты 80 и 443).

## Команды и навигация

| Команда / Кнопка | Описание |
|---|---|
| `/start` | Приветствие, авто-сид для новых пользователей |
| `/help` | Справка по всем возможностям |
| `/backup` | Выгрузить дамп базы в чат |
| «📝 Список» | Показать заметки текущего топика (reply-клавиатура) |
| «📂 Топики» | Показать список топиков (reply-клавиатура) |
| «📎» | Список вложений заметки (добавить, просмотреть, удалить) |
| «⚙️» | Раскрыть кнопки действий с заметкой (✏️, ✅, 🔄, 🗑, …) |
| Файл (медиа) | Прикрепляется к последней просмотренной заметке — без кнопки 📎 |

Основная навигация — через inline-кнопки с хлебными крошками (топик → папка → подпапка). Текстовый ввод используется только на этапах диалога (создание/редактирование заметки, название топика/папки).

## Структура проекта

```
.
├── cmd/
│   ├── bot/main.go                 # Telegram-бот: точка входа, ручной DI
│   └── api/main.go                 # REST API: отдельный сервис (cmd/api)
├── config/config.go                # Загрузка конфигурации (Load / LoadAPI)
├── internal/
│   ├── errors/errors.go            # Sentinel-ошибки
│   ├── model/                      # Доменная модель
│   │   ├── note.go                 #   Note (агрегат: приоритет, done, напоминания)
│   │   ├── folder.go               #   Folder (вложенные папки)
│   │   ├── topic.go                #   Topic (категории)
│   │   └── attachment.go           #   Attachment (вложения заметок)
│   ├── service/todo/               # Сервисный слой (оркестрация)
│   │   └── service.go              #   NoteService, TopicService, FolderService, AttachmentService
│   ├── repository/todo/            # Репозитории
│   │   ├── memstore.go             #   In-memory хранилище
│   │   ├── postgres.go             #   PostgreSQL хранилище
│   │   ├── users.go                #   Пользователи (users.id)
│   │   └── entity/                 #   Persistence-модели (Record + Converter)
│   ├── storage/fs/                 # Файловое хранилище вложений
│   │   └── store.go                #   Save/Delete/AbsPath (защита от path traversal)
│   ├── handler/
│   │   ├── telegram/               # Транспортный слой (Telegram API)
│   │   │   ├── handler.go          #   Обработчики + reminder-воркер + вложения
│   │   │   ├── renderer.go         #   Рендеринг сообщений и клавиатур
│   │   │   └── state.go            #   FSM-состояния (диалоги)
│   │   └── http/                   # REST API: router, auth, topics, notes, dto
│   ├── httperr/                    # Единый формат ошибок {"error": ...} + маппинг статусов
│   ├── middleware/                 # Logging, Recover, RequireAuth (cookie-сессии)
│   ├── session/                    # Веб-сессии (токен → SHA-256, TTL)
│   └── user/                       # Валидация username/пароля, bcrypt
├── web/                            # Веб-фронтенд: Vite + Svelte 5 + Tailwind v4 (PWA)
│   ├── Dockerfile                  #   Сборка статики → Caddy
│   └── Caddyfile                   #   Статика + прокси /api + авто-HTTPS
├── docs/ARCHITECTURE_GUIDE.md      # Руководство по архитектуре
├── docs/BACKEND_API_PLAN.md        # План REST API
├── docs/WEB_PLAN.md                # План веб-фронтенда
├── CHANGELOG.md                    # Карта обновлений (история версий)
├── Dockerfile                      # Multi-stage сборка (bot + api)
├── docker-compose.yml              # db + api + bot + web (Caddy)
├── deploy.sh                       # Скрипт развёртывания
├── Makefile
├── go.mod
└── go.sum
```

Подробнее об архитектуре — в [`docs/ARCHITECTURE_GUIDE.md`](docs/ARCHITECTURE_GUIDE.md).

## Лицензия

MIT
