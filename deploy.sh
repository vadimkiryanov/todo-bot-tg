#!/usr/bin/env bash
set -e

# ============================================================
# deploy.sh — развёртывание todo-bot-tg на Ubuntu
#
# Перед первым запуском создай .env:
#   cat > .env << 'EOF'
#   TELEGRAM_BOT_TOKEN=123456:ABC...DEF
#   DATABASE_URL=postgres://user:password@db:5432/dbname?sslmode=disable
#   EOF
#
# Дальше просто: bash deploy.sh
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $1"; }
err()  { echo -e "${RED}[!]${NC} $1"; exit 1; }

# --- Установка Docker ---
if ! command -v docker &>/dev/null; then
    log "Устанавливаю Docker..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq ca-certificates curl
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
        sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker "$USER"
    log "Docker установлен. Возможно, потребуется перезайти в сессию."
fi

# --- Автозапуск Docker при старте системы ---
if systemctl is-enabled docker &>/dev/null; then
    true
else
    log "Включаю автозапуск Docker..."
    sudo systemctl enable docker
fi

# --- Установка git ---
if ! command -v git &>/dev/null; then
    log "Устанавливаю git..."
    sudo apt-get install -y -qq git
fi

# --- Клонирование / обновление репозитория ---
DIR="$HOME/todo-bot-tg"
if [ -d "$DIR/.git" ]; then
    log "Обновляю репозиторий..."
    cd "$DIR"
    git pull
else
    log "Клонирую репозиторий..."
    git clone https://github.com/vadimkiryanov/todo-bot-tg.git "$DIR"
    cd "$DIR"
fi

# --- Проверяем .env ---
if [ ! -f .env ]; then
    err "Файл .env не найден. Создай его вручную (см. комментарий в начале скрипта)"
fi

# --- Сборка и запуск ---
log "Собираю и запускаю..."
docker compose up -d --build

log "Готово. Проверить логи: docker compose -f $DIR/docker-compose.yml logs -f"
