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
	"todo-bot-tg/internal/handler/telegram"
	repo "todo-bot-tg/internal/repository/todo"
	"todo-bot-tg/internal/service/todo"
	"todo-bot-tg/internal/session"
	"todo-bot-tg/internal/storage/fs"
	"todo-bot-tg/internal/user"
	"todo-bot-tg/internal/worker/pin"
	"todo-bot-tg/internal/worker/reminder"
)

// usersRepository — объединение интерфейсов потребителей (telegram.UserResolver +
// http.UserRepository), чтобы держать один репозиторий в DI.
type usersRepository interface {
	CreateUser(u user.User) (user.User, error)
	FindByUsername(username string) (user.User, error)
	GetByID(id int64) (user.User, error)
	FindOrCreateByTelegramID(telegramID int64) (int64, error)
	GetTelegramID(userID int64) (int64, error)
}

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

	// 2. Файловое хранилище вложений
	fileStore, err := fs.NewStore(cfg.FilesDir)
	if err != nil {
		log.Fatalf("Ошибка инициализации файлового хранилища: %v", err)
	}

	// 3. Сервис
	svc := todo.NewService(noteRepo, topicRepo, folderRepo, attRepo, settingsRepo, fileStore)

	// 4. Handler (реализует порт reminder.NotificationSender)
	h, err := telegram.NewHandler(cfg.Token, svc, svc, svc, svc, svc, usersRepo)
	if err != nil {
		log.Fatalf("Ошибка создания бота: %v", err)
	}

	// 5. Фоновые воркеры
	reminderWorker := reminder.NewWorker(svc, h)
	reminderWorker.Start()
	defer reminderWorker.Stop()

	// Воркер открепления просроченных закреплений
	pinWorker := pin.NewWorker(svc)
	pinWorker.Start()
	defer pinWorker.Stop()

	log.Println("Бот запущен...")

	// Запускаем Run в горутине, ждём сигнал или ошибку
	errCh := make(chan error, 1)
	go func() {
		errCh <- h.Run()
	}()

	// 6. HTTP-сервер (REST API) — внутри того же процесса, graceful shutdown
	var httpSrv *http.Server
	if cfg.HTTPAddr != "" {
		httpSrv = &http.Server{
			Addr:         cfg.HTTPAddr,
			Handler:      httpapi.NewRouter(usersRepo, sessionStore, svc, cfg.SessionTTL, cfg.CookieSecure(), cfg.Token),
			ReadTimeout:  10 * time.Second,
			WriteTimeout: 10 * time.Second,
			IdleTimeout:  60 * time.Second,
		}
		go func() {
			log.Printf("HTTP-сервер запущен на %s", cfg.HTTPAddr)
			if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				errCh <- fmt.Errorf("http-сервер: %w", err)
			}
		}()
	}

	select {
	case <-ctx.Done():
		log.Println("Получен сигнал остановки, завершаем...")
		h.Stop()
		if httpSrv != nil {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_ = httpSrv.Shutdown(shutdownCtx)
			cancel()
		}
	case err := <-errCh:
		if err != nil {
			log.Fatalf("Ошибка работы бота: %v", err)
		}
	}

	log.Println("Бот остановлен.")
}
