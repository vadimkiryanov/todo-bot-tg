.PHONY: run build db-up db-down db-reset

DB_NAME ?= todobot
DB_USER ?= todobot
DB_PASS ?= todobot
DB_PORT ?= 5432
DATABASE_URL ?= [MASKED]

build:
	go build -o bin/todobot .

run:
	go run .

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
