.PHONY: run build db-up db-down db-reset db-backup db-restore db-migrate-users

DB_NAME ?= todobot
DB_USER ?= todobot
DB_PASS ?= todobot
DB_PORT ?= 5432
DATABASE_URL ?= [MASKED]

build:
	go build -o bin/todobot ./cmd/bot/

run:
	go run ./cmd/bot/

# --- PostgreSQL ---

db-up:
	docker run -d --name todobot-pg \
		-e POSTGRES_USER=$(DB_USER) \
		-e POSTGRES_PASSWORD=$(DB_PASS) \
		-e POSTGRES_DB=$(DB_NAME) \
		-p $(DB_PORT):5432 \
		postgres:16-alpine
	@echo "Ждём готовности..."
	@sleep 3
	@echo "Готово. DATABASE_URL=$(DATABASE_URL)"

db-down:
	docker rm -f todobot-pg 2>/dev/null || true

db-reset: db-down db-up

# --- Бэкап и восстановление (docker compose) ---

db-backup:
	docker compose exec db pg_dump -U todobot todobot > backup-$$(date +%Y%m%d-%H%M).sql
	@echo "Бэкап сохранён: backup-$$(date +%Y%m%d-%H%M).sql"

db-restore:
	@test -n "$(FILE)" || (echo "Укажи файл: make db-restore FILE=backup.sql"; exit 1)
	docker compose exec -T db psql -U todobot todobot < $(FILE)
	@echo "Восстановлено из $(FILE)"

# Одноразовая привязка данных бота к users.id (docs/BACKEND_API_PLAN.md §3).
# Перед запуском обязательно: make db-backup
db-migrate-users:
	docker compose exec -T db psql -U todobot todobot < data/migrate_users.sql
	@echo "Миграция пользователей выполнена"
