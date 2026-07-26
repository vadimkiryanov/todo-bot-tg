#!/usr/bin/env bash
set -e

# ============================================================
# deploy.sh — развёртывание todo-bot-tg на Ubuntu
# Запуск: TELEGRAM_BOT_TOKEN=... bash deploy.sh
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $1"; }
err()  { echo -e "${RED}[!]${NC} $1"; exit 1; }

# --- Проверка токена ---
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    err "Укажи TELEGRAM_BOT_TOKEN: TELEGRAM_BOT_TOKEN=... bash deploy.sh"
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

# --- Сборка и запуск ---
DIR="$HOME/todo-bot-tg"
if [ -d "$DIR/.git" ]; then
    log "Обновляю репозиторий..."
    cd "$DIR"
    git pull
else
    log "Клонирую репозиторий..."
    git clone https://github.com/YOUR_USER/todo-bot-tg.git "$DIR"
    cd "$DIR"
fi

log "Собираю и запускаю..."
export TELEGRAM_BOT_TOKEN
docker compose up -d --build

log "Готово. Проверь: docker compose logs -f"
