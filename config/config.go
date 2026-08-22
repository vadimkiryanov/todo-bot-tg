package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

// Config содержит настройки бота.
type Config struct {
	Token       string
	DatabaseURL string // PostgreSQL DSN, если пусто — in-memory
	FilesDir    string // каталог файлового хранилища вложений
	HTTPAddr    string // адрес HTTP-сервера REST API, пусто — HTTP не запускается
}

// Load читает настройки из .env и переменных окружения.
func Load() (*Config, error) {
	_ = godotenv.Load()

	token := os.Getenv("TELEGRAM_BOT_TOKEN")
	if token == "" {
		return nil, fmt.Errorf("TELEGRAM_BOT_TOKEN не задан")
	}

	filesDir := os.Getenv("FILES_DIR")
	if filesDir == "" {
		filesDir = "data/files"
	}

	httpAddr := os.Getenv("HTTP_ADDR")
	if httpAddr == "" {
		httpAddr = ":8080"
	}

	return &Config{
		Token:       token,
		DatabaseURL: os.Getenv("DATABASE_URL"),
		FilesDir:    filesDir,
		HTTPAddr:    httpAddr,
	}, nil
}
