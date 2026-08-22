package http

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// tgAuthParams строит подписанные параметры Telegram Login Widget (как виджет
// редиректит на data-auth-url) для заданного токена и времени.
func tgAuthParams(botToken string, telegramID int64, authDate time.Time) url.Values {
	q := url.Values{}
	q.Set("id", strconv.FormatInt(telegramID, 10))
	q.Set("first_name", "Иван")
	q.Set("username", "ivan_test")
	q.Set("auth_date", strconv.FormatInt(authDate.Unix(), 10))

	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
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
	q.Set("hash", hex.EncodeToString(mac.Sum(nil)))
	return q
}

func TestTelegramAuth_Valid(t *testing.T) {
	q := tgAuthParams("test-token", 111, time.Now())
	require.True(t, validTelegramAuth("test-token", q, telegramAuthMaxAge))
}

func TestTelegramAuth_WrongToken(t *testing.T) {
	q := tgAuthParams("test-token", 111, time.Now())
	require.False(t, validTelegramAuth("other-token", q, telegramAuthMaxAge))
}

func TestTelegramAuth_Expired(t *testing.T) {
	q := tgAuthParams("test-token", 111, time.Now().Add(-2*24*time.Hour))
	require.False(t, validTelegramAuth("test-token", q, telegramAuthMaxAge))
}

func TestTelegramAuth_MissingHash(t *testing.T) {
	q := tgAuthParams("test-token", 111, time.Now())
	q.Del("hash")
	require.False(t, validTelegramAuth("test-token", q, telegramAuthMaxAge))
}

func TestTelegramAuth_TamperedID(t *testing.T) {
	// Подпись валидна, но id изменён — подпись не совпадает.
	q := tgAuthParams("test-token", 111, time.Now())
	q.Set("id", "999")
	require.False(t, validTelegramAuth("test-token", q, telegramAuthMaxAge))
}

func TestTgLogin_Success(t *testing.T) {
	router := newTestRouter(t)
	q := tgAuthParams("test-bot-token", 1113143852, time.Now())

	rec := doJSON(t, router, http.MethodGet, "/api/v1/auth/tg?"+q.Encode(), "")
	require.Equal(t, http.StatusFound, rec.Code)
	require.Equal(t, "/", rec.Header().Get("Location"))

	cookies := rec.Result().Cookies()
	require.Len(t, cookies, 1)
	require.Equal(t, "session", cookies[0].Name)
	require.True(t, cookies[0].HttpOnly)
	require.True(t, cookies[0].Secure)

	// Вошедший пользователь доступен через /me с этой cookie.
	rec = doJSON(t, router, http.MethodGet, "/api/v1/me", "", cookies[0])
	require.Equal(t, http.StatusOK, rec.Code)
}

func TestTgLogin_BadHash(t *testing.T) {
	router := newTestRouter(t)
	q := tgAuthParams("wrong-token", 111, time.Now()) // подпись не тем токеном

	rec := doJSON(t, router, http.MethodGet, "/api/v1/auth/tg?"+q.Encode(), "")
	require.Equal(t, http.StatusFound, rec.Code)
	require.Equal(t, "/login?error=telegram_invalid", rec.Header().Get("Location"))
	require.Len(t, rec.Result().Cookies(), 0)
}

func TestTgLogin_InvalidID(t *testing.T) {
	router := newTestRouter(t)
	q := tgAuthParams("test-bot-token", 0, time.Now())

	rec := doJSON(t, router, http.MethodGet, "/api/v1/auth/tg?"+q.Encode(), "")
	require.Equal(t, http.StatusFound, rec.Code)
	require.Equal(t, "/login?error=telegram_invalid", rec.Header().Get("Location"))
}

func TestTgLogin_Disabled(t *testing.T) {
	router := newTestRouterTgDisabled(t)
	q := tgAuthParams("test-bot-token", 111, time.Now())

	rec := doJSON(t, router, http.MethodGet, "/api/v1/auth/tg?"+q.Encode(), "")
	require.Equal(t, http.StatusFound, rec.Code)
	require.Equal(t, "/login?error=telegram_disabled", rec.Header().Get("Location"))
	require.Len(t, rec.Result().Cookies(), 0)
}

func TestTgLogin_SameTelegramID_ReturnsSameUser(t *testing.T) {
	router := newTestRouter(t)
	q1 := tgAuthParams("test-bot-token", 42, time.Now())

	rec1 := doJSON(t, router, http.MethodGet, "/api/v1/auth/tg?"+q1.Encode(), "")
	require.Equal(t, http.StatusFound, rec1.Code)
	cookie1 := rec1.Result().Cookies()
	require.Len(t, cookie1, 1)

	rec1me := doJSON(t, router, http.MethodGet, "/api/v1/me", "", cookie1[0])
	require.Equal(t, http.StatusOK, rec1me.Code)

	// Повторный вход тем же telegram_id — тот же пользователь, /me отвечает 200.
	q2 := tgAuthParams("test-bot-token", 42, time.Now())
	rec2 := doJSON(t, router, http.MethodGet, "/api/v1/auth/tg?"+q2.Encode(), "")
	require.Equal(t, http.StatusFound, rec2.Code)
	cookie2 := rec2.Result().Cookies()
	require.Len(t, cookie2, 1)
	rec2me := doJSON(t, router, http.MethodGet, "/api/v1/me", "", cookie2[0])
	require.Equal(t, http.StatusOK, rec2me.Code)
}
