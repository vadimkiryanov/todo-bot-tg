package middleware

import (
	"log/slog"
	"net/http"

	"todo-bot-tg/internal/httperr"
)

// Recover перехватывает панику хендлера: логирует стек и возвращает 500,
// не раскрывая клиенту деталей паники.
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic в http-хендлере", "path", r.URL.Path, "panic", rec)
				httperr.Write(w, httperr.ErrInternal)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
