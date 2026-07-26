package main

import (
	"log"

	"todo-bot-tg/bot"
	"todo-bot-tg/config"
	"todo-bot-tg/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Ошибка конфигурации: %v", err)
	}

	var dataStore store.Store
	if cfg.DatabaseURL != "" {
		pgStore, err := store.NewPostgresStore(cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("Ошибка подключения к PostgreSQL: %v", err)
		}
		defer pgStore.Close()
		dataStore = pgStore
		log.Println("Хранилище: PostgreSQL")
	} else {
		dataStore = store.NewMemStore()
		log.Println("Хранилище: in-memory (DATABASE_URL не задан)")
	}

	b, err := bot.New(cfg.Token, dataStore)
	if err != nil {
		log.Fatalf("Ошибка создания бота: %v", err)
	}

	log.Println("Бот запущен...")
	if err := b.Run(); err != nil {
		log.Fatalf("Ошибка работы бота: %v", err)
	}
}
