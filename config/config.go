package config

import (
	"fmt"
	"os"
	"time"

	"github.com/joho/godotenv"
)

// Config содержит настройки сервисов (bot и api).
type Config struct {
	Token       string        // Telegram-токен бота (только для cmd/bot)
	DatabaseURL string        // PostgreSQL DSN, если пусто — in-memory
	FilesDir    string        // каталог файлового хранилища вложений
	HTTPAddr    string        // адрес HTTP-сервера REST API, пусто — HTTP не запускается
	SessionTTL  time.Duration // срок жизни веб-сессии
	AppBaseURL  string        // публичный домен (для HTTPS/Set-Cookie при деплое)
}

// Load читает конфигурацию для бота (cmd/bot): требует TELEGRAM_BOT_TOKEN.
func Load() (*Config, error) {
	return load(true)
}

// LoadAPI читает конфигурацию для REST-сервиса (cmd/api): токен бота не нужен.
func LoadAPI() (*Config, error) {
	return load(false)
}

func load(requireToken bool) (*Config, error) {
	_ = godotenv.Load()

	token := os.Getenv("TELEGRAM_BOT_TOKEN")
	if requireToken && token == "" {
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

	sessionTTL := 30 * 24 * time.Hour
	if v := os.Getenv("SESSION_TTL"); v != "" {
		parsed, err := time.ParseDuration(v)
		if err != nil {
			return nil, fmt.Errorf("SESSION_TTL: %w", err)
		}
		sessionTTL = parsed
	}

	return &Config{
		Token:       token,
		DatabaseURL: os.Getenv("DATABASE_URL"),
		FilesDir:    filesDir,
		HTTPAddr:    httpAddr,
		SessionTTL:  sessionTTL,
		AppBaseURL:  os.Getenv("APP_BASE_URL"),
	}, nil
}
