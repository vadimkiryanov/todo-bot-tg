package http

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestAuth_CookieSecure_HTTPSMode: доменный APP_BASE_URL → cookie Secure=true.
// Инвариант уже покрыт registerUser, здесь фиксируем его явно.
func TestAuth_CookieSecure_HTTPSMode(t *testing.T) {
	cookie := registerUser(t, newTestRouter(t), "alice", "password123")
	require.True(t, cookie.Secure)
}

// TestAuth_CookieSecure_HTTPMode: APP_BASE_URL=:80 (или localhost) → cookie без
// Secure, иначе браузер не примет её по HTTP и вход в веб сломается.
func TestAuth_CookieSecure_HTTPMode(t *testing.T) {
	router := newTestRouterCookieSecure(t, false)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register",
		strings.NewReader(`{"username":"bob","password":"password123"}`))
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)

	cookies := rec.Result().Cookies()
	require.Len(t, cookies, 1)
	require.Equal(t, "session", cookies[0].Name)
	require.False(t, cookies[0].Secure)
	require.True(t, cookies[0].HttpOnly)
}
