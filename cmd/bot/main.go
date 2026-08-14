package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"todo-bot-tg/config"
	"todo-bot-tg/internal/handler/telegram"
	repo "todo-bot-tg/internal/repository/todo"
	"todo-bot-tg/internal/service/todo"
	"todo-bot-tg/internal/storage/fs"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Ошибка конфигурации: %v", err)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	// 1. Репозитории
	var noteRepo todo.NoteRepository
	var topicRepo todo.TopicRepository
	var folderRepo todo.FolderRepository
	var attRepo todo.AttachmentRepository

	if cfg.DatabaseURL != "" {
		pgStore, err := repo.NewPostgresStore(cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("Ошибка подключения к PostgreSQL: %v", err)
		}
		defer pgStore.Close()
		noteRepo = pgStore
		topicRepo = pgStore
		folderRepo = pgStore
		attRepo = pgStore
		log.Println("Хранилище: PostgreSQL")
	} else {
		memStore := repo.NewMemStore()
		noteRepo = memStore
		topicRepo = memStore
		folderRepo = memStore
		attRepo = memStore
		log.Println("Хранилище: in-memory (DATABASE_URL не задан)")
	}

	// 2. Файловое хранилище вложений
	fileStore, err := fs.NewStore(cfg.FilesDir)
	if err != nil {
		log.Fatalf("Ошибка инициализации файлового хранилища: %v", err)
	}

	// 3. Сервис
	svc := todo.NewService(noteRepo, topicRepo, folderRepo, attRepo, fileStore)

	// 4. Handler
	h, err := telegram.NewHandler(cfg.Token, svc, svc, svc, svc)
	if err != nil {
		log.Fatalf("Ошибка создания бота: %v", err)
	}

	log.Println("Бот запущен...")
	h.StartReminderWorker()

	// Запускаем Run в горутине, ждём сигнал или ошибку
	errCh := make(chan error, 1)
	go func() {
		errCh <- h.Run()
	}()

	select {
	case <-ctx.Done():
		log.Println("Получен сигнал остановки, завершаем...")
		h.Stop()
	case err := <-errCh:
		if err != nil {
			log.Fatalf("Ошибка работы бота: %v", err)
		}
	}

	log.Println("Бот остановлен.")
}
