package http

import (
	"net/http"

	"todo-bot-tg/internal/middleware"
)

// NewRouter собирает HTTP-маршруты API и оборачивает их middleware-цепочкой.
// Порядок: Recover внутри Logging — паника логируется с реальным статусом 500.
func NewRouter() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealthz)
	return middleware.Logging(middleware.Recover(mux))
}
