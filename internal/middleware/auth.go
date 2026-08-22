package middleware

import (
	"context"
	"net/http"

	errs "todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/httperr"
	"todo-bot-tg/internal/session"
)

// SessionCookie — имя cookie веб-сессии.
const SessionCookie = "session"

// SessionStore — интерфейс хранилища сессий (потребитель — middleware).
type SessionStore interface {
	Get(tokenHash string) (session.Session, error)
}

type ctxKey int

const userIDKey ctxKey = 0

// RequireAuth проверяет cookie сессии и кладёт userID в контекст запроса.
// Без валидной сессии — 401 в едином формате ошибки.
func RequireAuth(sessions SessionStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(SessionCookie)
			if err != nil {
				httperr.Write(w, errs.ErrInvalidCredentials)
				return
			}

			sess, err := sessions.Get(session.HashToken(cookie.Value))
			if err != nil {
				// Сессия не найдена или истекла — клиенту не раскрываем причину
				httperr.Write(w, errs.ErrInvalidCredentials)
				return
			}

			ctx := context.WithValue(r.Context(), userIDKey, sess.UserID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// UserID возвращает userID из контекста (0, если не установлен).
func UserID(ctx context.Context) int64 {
	id, _ := ctx.Value(userIDKey).(int64)
	return id
}
