#!/usr/bin/env bash
set -e

# ============================================================
# deploy.sh — развёртывание todo-bot-tg на Ubuntu
# Запуск: bash deploy.sh <TELEGRAM_BOT_TOKEN>
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $1"; }
err()  { echo -e "${RED}[!]${NC} $1"; exit 1; }

# --- Токен: аргумент или переменная окружения ---
TOKEN="${1:-$TELEGRAM_BOT_TOKEN}"
if [ -z "$TOKEN" ]; then
    err "Укажи токен: bash deploy.sh 123456:ABC...DEF"
fi

# --- Установка Docker, если нет ---
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
    log "Docker установлен. Возможно, потребуется перезайти в сессию для прав docker."
fi

# --- Установка git, если нет ---
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

# --- Создаём .env ---
cat > .env <<EOF
TELEGRAM_BOT_TOKEN=$TOKEN
DATABASE_URL=[MASKED]
EOF
log ".env создан"

# --- Сборка и запуск ---
log "Собираю и запускаю..."
docker compose up -d --build

log "Готово. Проверить логи: docker compose -f $DIR/docker-compose.yml logs -f"
