package http

import (
	"net/http"

	"todo-bot-tg/internal/middleware"
	"todo-bot-tg/internal/session"
)

// NewRouter собирает HTTP-маршруты API и оборачивает их middleware-цепочкой.
// Порядок: Recover внутри Logging — паника логируется с реальным статусом 500.
// Все маршруты, кроме /auth/* и /healthz, требуют валидную сессию (RequireAuth).
func NewRouter(users UserRepository, sessions session.Store) http.Handler {
	mux := http.NewServeMux()
	auth := newAuthHandler(users, sessions)

	mux.HandleFunc("GET /healthz", handleHealthz)
	mux.HandleFunc("POST /api/v1/auth/register", auth.register)
	mux.HandleFunc("POST /api/v1/auth/login", auth.login)
	mux.HandleFunc("POST /api/v1/auth/logout", auth.logout)
	mux.Handle("GET /api/v1/me", middleware.RequireAuth(sessions)(http.HandlerFunc(auth.me)))

	return middleware.Logging(middleware.Recover(mux))
}
