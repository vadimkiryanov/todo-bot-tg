.PHONY: run api build db-up db-down db-reset db-backup db-restore db-migrate-users

DB_NAME ?= todobot
DB_USER ?= todobot
DB_PASS ?= todobot
DB_PORT ?= 5432
DATABASE_URL ?= postgres://$(DB_USER):$(DB_PASS)@localhost:$(DB_PORT)/$(DB_NAME)

build:
	go build -o bin/todobot ./cmd/bot/
	go build -o bin/todoapi ./cmd/api/

run:
	go run ./cmd/bot/

# REST API отдельным процессом (без Telegram-бота)
api:
	go run ./cmd/api/

# --- PostgreSQL ---

# Если контейнер уже создан — просто стартуем его (данные сохраняются),
# иначе создаём новый.
db-up:
	@docker start todobot-pg 2>/dev/null || \
		docker run -d --name todobot-pg \
			-e POSTGRES_USER=$(DB_USER) \
			-e POSTGRES_PASSWORD=$(DB_PASS) \
			-e POSTGRES_DB=$(DB_NAME) \
			-p $(DB_PORT):5432 \
			postgres:16-alpine
	@echo "Ждём готовности..."
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		docker exec todobot-pg pg_isready -U $(DB_USER) -d $(DB_NAME) >/dev/null 2>&1 && break; \
		sleep 1; \
	done
	@docker exec todobot-pg pg_isready -U $(DB_USER) -d $(DB_NAME)
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
