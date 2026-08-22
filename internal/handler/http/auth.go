package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	errs "todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/handler/http/dto"
	"todo-bot-tg/internal/httperr"
	"todo-bot-tg/internal/middleware"
	"todo-bot-tg/internal/session"
	"todo-bot-tg/internal/user"
)

// UserRepository — интерфейс хранилища пользователей (потребитель — HTTP-handler).
type UserRepository interface {
	CreateUser(u user.User) (user.User, error)
	FindByUsername(username string) (user.User, error)
	GetByID(id int64) (user.User, error)
}

// SessionStore — интерфейс хранилища сессий (потребитель — HTTP-handler).
type SessionStore interface {
	Create(sess session.Session) error
	Delete(tokenHash string) error
}

// authHandler — обработчики эндпоинтов авторизации (§6).
type authHandler struct {
	users        UserRepository
	sessions     SessionStore
	sessionTTL   time.Duration
	cookieSecure bool
}

func newAuthHandler(users UserRepository, sessions SessionStore, sessionTTL time.Duration, cookieSecure bool) *authHandler {
	return &authHandler{users: users, sessions: sessions, sessionTTL: sessionTTL, cookieSecure: cookieSecure}
}

// register обрабатывает POST /api/v1/auth/register → 201 {user} + Set-Cookie.
func (h *authHandler) register(w http.ResponseWriter, r *http.Request) {
	var input dto.RegisterRequest
	if err := decodeJSON(r, &input); err != nil {
		httperr.Write(w, errs.ErrInvalidJSON)
		return
	}

	if err := user.ValidateUsername(input.Username); err != nil {
		httperr.Write(w, err)
		return
	}
	if err := user.ValidatePassword(input.Password); err != nil {
		httperr.Write(w, err)
		return
	}

	u, err := user.NewUserWithHash(input.Username, input.Password)
	if err != nil {
		httperr.Write(w, err)
		return
	}

	created, err := h.users.CreateUser(u)
	if err != nil {
		httperr.Write(w, err) // 409 ErrUsernameTaken
		return
	}

	if err := h.createSession(w, created.ID); err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, dto.UserEnvelope{User: dto.ToUserResponse(created)})
}

// login обрабатывает POST /api/v1/auth/login → 200 {user} + Set-Cookie.
// Несуществующий логин и неверный пароль дают одинаковый ответ 401 —
// чтобы не раскрывать наличие аккаунта.
func (h *authHandler) login(w http.ResponseWriter, r *http.Request) {
	var input dto.LoginRequest
	if err := decodeJSON(r, &input); err != nil {
		httperr.Write(w, errs.ErrInvalidJSON)
		return
	}

	u, err := h.users.FindByUsername(input.Username)
	if err != nil {
		if errors.Is(err, errs.ErrUserNotFound) {
			httperr.Write(w, errs.ErrInvalidCredentials)
		} else {
			httperr.Write(w, err)
		}
		return
	}

	if err := user.CheckPassword(input.Password, u.PasswordHash); err != nil {
		httperr.Write(w, err)
		return
	}

	if err := h.createSession(w, u.ID); err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, dto.UserEnvelope{User: dto.ToUserResponse(u)})
}

// logout обрабатывает POST /api/v1/auth/logout → 204. Идемпотентен:
// сессия удаляется, cookie стирается независимо от наличия сессии.
func (h *authHandler) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(middleware.SessionCookie); err == nil {
		_ = h.sessions.Delete(session.HashToken(cookie.Value))
	}
	http.SetCookie(w, expiredSessionCookie(h.cookieSecure))
	w.WriteHeader(http.StatusNoContent)
}

// me обрабатывает GET /api/v1/me → {user: {id, username}}.
// userID извлекается middleware'ом RequireAuth из cookie.
func (h *authHandler) me(w http.ResponseWriter, r *http.Request) {
	u, err := h.users.GetByID(middleware.UserID(r.Context()))
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, dto.UserEnvelope{User: dto.ToUserResponse(u)})
}

// createSession генерирует токен, сохраняет сессию и выдаёт cookie.
func (h *authHandler) createSession(w http.ResponseWriter, userID int64) error {
	token, hash, err := session.GenerateToken()
	if err != nil {
		return err
	}
	if err := h.sessions.Create(session.New(hash, userID, h.sessionTTL)); err != nil {
		return err
	}

	http.SetCookie(w, &http.Cookie{
		Name:     middleware.SessionCookie,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(h.sessionTTL.Seconds()),
	})
	return nil
}

// expiredSessionCookie возвращает cookie с истёкшим сроком (для logout).
func expiredSessionCookie(cookieSecure bool) *http.Cookie {
	return &http.Cookie{
		Name:     middleware.SessionCookie,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   cookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	}
}

// decodeJSON десериализует тело запроса. Пустое тело — ошибка 400.
func decodeJSON(r *http.Request, v any) error {
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil {
		return errs.ErrInvalidJSON
	}
	return nil
}

// writeJSON пишет ответ в едином JSON-формате.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
