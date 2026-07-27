package main

import (
	"log"

	"todo-bot-tg/config"
	"todo-bot-tg/internal/handler/telegram"
	repo "todo-bot-tg/internal/repository/todo"
	"todo-bot-tg/internal/service/todo"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Ошибка конфигурации: %v", err)
	}

	// 1. Репозитории
	var noteRepo todo.NoteRepository
	var topicRepo todo.TopicRepository

	if cfg.DatabaseURL != "" {
		pgStore, err := repo.NewPostgresStore(cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("Ошибка подключения к PostgreSQL: %v", err)
		}
		defer pgStore.Close()
		noteRepo = pgStore
		topicRepo = pgStore
		log.Println("Хранилище: PostgreSQL")
	} else {
		memStore := repo.NewMemStore()
		noteRepo = memStore
		topicRepo = memStore
		log.Println("Хранилище: in-memory (DATABASE_URL не задан)")
	}

	// 2. Сервис
	svc := todo.NewService(noteRepo, topicRepo)

	// 3. Handler
	h, err := telegram.NewHandler(cfg.Token, svc, svc)
	if err != nil {
		log.Fatalf("Ошибка создания бота: %v", err)
	}

	log.Println("Бот запущен...")
	if err := h.Run(); err != nil {
		log.Fatalf("Ошибка работы бота: %v", err)
	}
}
