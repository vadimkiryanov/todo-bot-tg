package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"todo-bot-tg/config"
	httpapi "todo-bot-tg/internal/handler/http"
	repo "todo-bot-tg/internal/repository/todo"
	"todo-bot-tg/internal/service/todo"
	"todo-bot-tg/internal/session"
	"todo-bot-tg/internal/storage/fs"
	"todo-bot-tg/internal/user"
)

// usersRepository — интерфейсы потребителей (http.UserRepository + http.SessionStore),
// чтобы держать один репозиторий в DI.
type usersRepository interface {
	CreateUser(u user.User) (user.User, error)
	FindByUsername(username string) (user.User, error)
	GetByID(id int64) (user.User, error)
	FindOrCreateByTelegramID(telegramID int64) (int64, error)
}

func main() {
	cfg, err := config.LoadAPI()
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
	var settingsRepo todo.SettingsRepository
	var usersRepo usersRepository
	var sessionStore session.Store

	if cfg.DatabaseURL != "" {
		pgStore, err := repo.NewPostgresStore(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("Ошибка подключения к PostgreSQL: %v", err)
		}
		defer pgStore.Close()
		noteRepo = pgStore
		topicRepo = pgStore
		folderRepo = pgStore
		attRepo = pgStore
		settingsRepo = pgStore
		usersRepo = pgStore
		sessionStore = session.NewPostgresStore(pgStore.Pool())
		log.Println("Хранилище: PostgreSQL")
	} else {
		memStore := repo.NewMemStore()
		noteRepo = memStore
		topicRepo = memStore
		folderRepo = memStore
		attRepo = memStore
		settingsRepo = memStore
		usersRepo = memStore
		sessionStore = session.NewMemoryStore()
		log.Println("Хранилище: in-memory (DATABASE_URL не задан)")
	}

	// 2. Файловое хранилище вложений (сервис требует, хотя эндпоинтов нет)
	fileStore, err := fs.NewStore(cfg.FilesDir)
	if err != nil {
		log.Fatalf("Ошибка инициализации файлового хранилища: %v", err)
	}

	// 3. Сервис
	svc := todo.NewService(noteRepo, topicRepo, folderRepo, attRepo, settingsRepo, fileStore)

	// 4. HTTP-сервер (REST API)
	srv := &http.Server{
		Addr: cfg.HTTPAddr,
		// cfg.Token — токен бота для входа через Telegram (пусто — вход отключён)
		Handler:      httpapi.NewRouter(usersRepo, sessionStore, svc, cfg.SessionTTL, cfg.CookieSecure(), cfg.Token),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("REST API запущен на %s", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- fmt.Errorf("http-сервер: %w", err)
		}
	}()

	select {
	case <-ctx.Done():
		log.Println("Получен сигнал остановки, завершаем...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_ = srv.Shutdown(shutdownCtx)
		cancel()
	case err := <-errCh:
		log.Fatalf("Ошибка работы API: %v", err)
	}

	log.Println("REST API остановлен.")
}
