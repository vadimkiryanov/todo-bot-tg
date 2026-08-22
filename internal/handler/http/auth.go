package http

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
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
	FindOrCreateByTelegramID(telegramID int64) (int64, error)
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
	botToken     string // токен Telegram-бота (вход через виджет); пусто — вход отключён
}

func newAuthHandler(users UserRepository, sessions SessionStore, sessionTTL time.Duration, cookieSecure bool, botToken string) *authHandler {
	return &authHandler{
		users:        users,
		sessions:     sessions,
		sessionTTL:   sessionTTL,
		cookieSecure: cookieSecure,
		botToken:     botToken,
	}
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

// telegramAuthMaxAge — максимальный возраст auth_date (защита от replay).
const telegramAuthMaxAge = 24 * time.Hour

// tgLogin обрабатывает GET /api/v1/auth/tg — вход через Telegram Login Widget.
// Виджет редиректит сюда с подписанными параметрами (hash — HMAC-SHA256 по токену бота).
// При успехе: сессия + cookie + редирект на "/"; при ошибке — на /login?error=telegram_*.
func (h *authHandler) tgLogin(w http.ResponseWriter, r *http.Request) {
	if h.botToken == "" {
		http.Redirect(w, r, "/login?error=telegram_disabled", http.StatusFound)
		return
	}

	q := r.URL.Query()
	telegramID, err := strconv.ParseInt(q.Get("id"), 10, 64)
	if err != nil || telegramID == 0 {
		http.Redirect(w, r, "/login?error=telegram_invalid", http.StatusFound)
		return
	}
	if !validTelegramAuth(h.botToken, q, telegramAuthMaxAge) {
		http.Redirect(w, r, "/login?error=telegram_invalid", http.StatusFound)
		return
	}

	userID, err := h.users.FindOrCreateByTelegramID(telegramID)
	if err != nil {
		http.Redirect(w, r, "/login?error=telegram_failed", http.StatusFound)
		return
	}
	if err := h.createSession(w, userID); err != nil {
		http.Redirect(w, r, "/login?error=telegram_failed", http.StatusFound)
		return
	}
	http.Redirect(w, r, "/", http.StatusFound)
}

// validTelegramAuth проверяет подпись данных Telegram Login Widget.
// secret = SHA256(bot token); data_check_string = отсортированные key=value (кроме hash),
// склеенные через \n; hash = hex(HMAC-SHA256(secret, data_check_string)).
func validTelegramAuth(botToken string, q url.Values, maxAge time.Duration) bool {
	hash := q.Get("hash")
	if hash == "" {
		return false
	}

	keys := make([]string, 0, len(q))
	for k := range q {
		if k != "hash" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)

	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(q.Get(k))
	}

	secret := sha256.Sum256([]byte(botToken))
	mac := hmac.New(sha256.New, secret[:])
	mac.Write([]byte(b.String()))
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(hash)) {
		return false
	}

	authDate, err := strconv.ParseInt(q.Get("auth_date"), 10, 64)
	if err != nil {
		return false
	}
	return time.Since(time.Unix(authDate, 0)) <= maxAge
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
