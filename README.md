# todo-bot-tg

Персональный таск-менеджер в Telegram на Go.

Бот позволяет управлять заметками прямо в чате: создавать, редактировать, архивировать, задавать приоритеты, распределять по топикам и устанавливать напоминания. Интерфейс построен на inline-кнопках — вся навигация происходит в одном сообщении.

## Возможности

- **Заметки** — создание, редактирование текста, удаление, архивация/разархивация. Пагинация по 10 штук.
- **Топики** — категоризация заметок по темам (например, «Личное», «Работа»). Создание, удаление, переключение активного топика.
- **Приоритеты** — четыре уровня: без приоритета (🔵), низкий, средний (🟡), высокий (🔴). Выбор при создании, циклическое переключение при просмотре.
- **Напоминания** — установка даты и времени через интерактивный календарь (месяц → день → час → минуты) с кнопками «Сегодня»/«Завтра». Фоновый воркер проверяет просроченные напоминания каждые 30 секунд.
- **Inline-редактирование** — кнопка ✏️ вставляет текст заметки в поле ввода через `SwitchInlineQueryCurrentChat` (без отправки сообщения).
- **Бэкап** — команда `/backup` дампит базу и отправляет SQL-файл прямо в чат.
- **Авто-сид** — при первом `/start` создаются топики по умолчанию и демо-заметки.
- **Reply-клавиатура** — быстрые кнопки «📝 Список» и «📂 Топики».

## Стек

| Компонент | Технология |
|---|---|
| Язык | Go 1.23 |
| Telegram API | [go-telegram-bot-api/v5](https://github.com/go-telegram-bot-api/telegram-bot-api) |
| База данных | PostgreSQL 16 |
| Драйвер БД | [lib/pq](https://github.com/lib/pq) |
| Конфигурация | `.env` + [godotenv](https://github.com/joho/godotenv) |
| Контейнеризация | Docker (multi-stage, образ ~10 MB) |

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

## Переменные окружения

| Переменная | Обязательная | Описание |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Да | Токен бота от [@BotFather](https://t.me/BotFather) |
| `DATABASE_URL` | Нет | PostgreSQL DSN. Если не задан — используется in-memory хранилище |

## Makefile

| Команда | Описание |
|---|---|
| `make build` | Собрать бинарник → `bin/todobot` |
| `make run` | Запустить (`go run ./cmd/bot/`) |
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

## Команды бота

| Команда | Описание |
|---|---|
| `/start` | Приветствие, авто-сид для новых пользователей |
| `/help` | Справка по всем возможностям |
| `/backup` | Выгрузить дамп базы в чат |

Основная навигация — через inline-кнопки. Текстовый ввод используется только на этапах диалога (создание/редактирование заметки, название топика).

## Структура проекта

```
.
├── cmd/bot/main.go                 # Точка входа, ручной DI
├── config/config.go                # Загрузка конфигурации
├── internal/
│   ├── errors/errors.go            # Sentinel-ошибки
│   ├── model/                      # Доменная модель (Note, Topic)
│   ├── service/todo/               # Сервисный слой (оркестрация)
│   ├── repository/todo/            # Репозитории (MemStore, PostgresStore)
│   └── handler/telegram/           # Транспортный слой (Telegram API)
├── docs/ARCHITECTURE_GUIDE.md      # Руководство по архитектуре
├── Dockerfile                      # Multi-stage сборка
├── docker-compose.yml              # bot + PostgreSQL
├── deploy.sh                       # Скрипт развёртывания
├── Makefile
├── go.mod
└── go.sum
```

Подробнее об архитектуре — в [`docs/ARCHITECTURE_GUIDE.md`](docs/ARCHITECTURE_GUIDE.md).

## Лицензия

MIT
