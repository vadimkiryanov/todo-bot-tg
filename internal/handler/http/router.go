package http

import (
	"net/http"
	"time"

	"todo-bot-tg/internal/middleware"
	"todo-bot-tg/internal/session"
)

// NewRouter собирает HTTP-маршруты API и оборачивает их middleware-цепочкой.
// Порядок: Recover внутри Logging — паника логируется с реальным статусом 500.
// Все маршруты, кроме /auth/* и /healthz, требуют валидную сессию (RequireAuth).
// sessionTTL — срок жизни сессии (cookie Max-Age и expires_at в хранилище).
// cookieSecure — помечать сессионную cookie флагом Secure (true — только HTTPS).
// botToken — токен Telegram-бота для входа через виджет; пусто — вход отключён.
func NewRouter(users UserRepository, sessions session.Store, svc TodoService, sessionTTL time.Duration, cookieSecure bool, botToken string) http.Handler {
	mux := http.NewServeMux()
	auth := newAuthHandler(users, sessions, sessionTTL, cookieSecure, botToken)
	todo := newTodoHandler(svc)

	mux.HandleFunc("GET /healthz", handleHealthz)
	mux.HandleFunc("POST /api/v1/auth/register", auth.register)
	mux.HandleFunc("POST /api/v1/auth/login", auth.login)
	mux.HandleFunc("POST /api/v1/auth/logout", auth.logout)
	mux.HandleFunc("GET /api/v1/auth/tg", auth.tgLogin)
	mux.HandleFunc("POST /api/v1/auth/tg", auth.tgLogin)

	// Маршруты с сессией: middleware.RequireAuth кладёт userID в контекст.
	withAuth := func(h http.HandlerFunc) http.Handler {
		return middleware.RequireAuth(sessions)(h)
	}
	mux.Handle("GET /api/v1/me", withAuth(auth.me))

	mux.Handle("GET /api/v1/topics", withAuth(todo.listTopics))
	mux.Handle("POST /api/v1/topics", withAuth(todo.createTopic))
	mux.Handle("PATCH /api/v1/topics/{id}", withAuth(todo.renameTopic))
	mux.Handle("DELETE /api/v1/topics/{id}", withAuth(todo.deleteTopic))

	mux.Handle("GET /api/v1/notes", withAuth(todo.listNotes))
	mux.Handle("POST /api/v1/notes", withAuth(todo.createNote))
	mux.Handle("PATCH /api/v1/notes/{id}", withAuth(todo.patchNote))
	mux.Handle("DELETE /api/v1/notes/{id}", withAuth(todo.deleteNote))

	return middleware.Logging(middleware.Recover(mux))
}
