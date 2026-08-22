package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// registerUser регистрирует пользователя через API и возвращает cookie сессии.
func registerUser(t *testing.T, router http.Handler, username, password string) *http.Cookie {
	t.Helper()
	body := `{"username":"` + username + `","password":"` + password + `"}`
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", strings.NewReader(body))
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusCreated, rec.Code, "тело: %s", rec.Body.String())
	cookies := rec.Result().Cookies()
	require.Len(t, cookies, 1, "должна быть одна cookie")
	require.Equal(t, "session", cookies[0].Name)
	require.True(t, cookies[0].HttpOnly)
	require.True(t, cookies[0].Secure)
	require.Equal(t, http.SameSiteLaxMode, cookies[0].SameSite)
	return cookies[0]
}

func doJSON(t *testing.T, router http.Handler, method, path, body string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestAuth_Register_Login_Me_Logout(t *testing.T) {
	router := newTestRouter(t)

	// 1. Регистрация → 201 + Set-Cookie + {user}
	cookie := registerUser(t, router, "alice", "password123")

	// 2. /me с cookie → профиль
	rec := doJSON(t, router, http.MethodGet, "/api/v1/me", "", cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	var env struct {
		User struct {
			ID       int64  `json:"id"`
			Username string `json:"username"`
		} `json:"user"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &env))
	require.Equal(t, "alice", env.User.Username)
	require.Positive(t, env.User.ID)

	// 3. Выход → 204, cookie стёрта
	rec = doJSON(t, router, http.MethodPost, "/api/v1/auth/logout", "", cookie)
	require.Equal(t, http.StatusNoContent, rec.Code)
	clearCookie := rec.Result().Cookies()
	require.Len(t, clearCookie, 1)
	require.Equal(t, "", clearCookie[0].Value)
	require.Negative(t, clearCookie[0].MaxAge)

	// 4. /me после выхода → 401
	rec = doJSON(t, router, http.MethodGet, "/api/v1/me", "", cookie)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
	require.Contains(t, rec.Body.String(), `"error"`)

	// 5. Повторный вход → 200
	rec = doJSON(t, router, http.MethodPost, "/api/v1/auth/login",
		`{"username":"alice","password":"password123"}`)
	require.Equal(t, http.StatusOK, rec.Code)
}

func TestAuth_Register_UsernameTaken(t *testing.T) {
	router := newTestRouter(t)
	registerUser(t, router, "bob", "password123")

	rec := doJSON(t, router, http.MethodPost, "/api/v1/auth/register",
		`{"username":"bob","password":"another-pass"}`)
	require.Equal(t, http.StatusConflict, rec.Code)
	require.Contains(t, rec.Body.String(), "уже занято")
}

func TestAuth_Register_InvalidInput(t *testing.T) {
	router := newTestRouter(t)

	cases := []struct {
		name string
		body string
	}{
		{"короткий логин", `{"username":"ab","password":"password123"}`},
		{"кириллица в логине", `{"username":"пользователь","password":"password123"}`},
		{"короткий пароль", `{"username":"alice","password":"short"}`},
		{"битый JSON", `{"username":`},
		{"пустое тело", ``},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := doJSON(t, router, http.MethodPost, "/api/v1/auth/register", tc.body)
			require.Equal(t, http.StatusBadRequest, rec.Code)
		})
	}
}

func TestAuth_Login_WrongPassword(t *testing.T) {
	router := newTestRouter(t)
	registerUser(t, router, "carol", "password123")

	rec := doJSON(t, router, http.MethodPost, "/api/v1/auth/login",
		`{"username":"carol","password":"wrong-password"}`)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
	require.Contains(t, rec.Body.String(), "неверный логин или пароль")
}

func TestAuth_Login_UnknownUser(t *testing.T) {
	router := newTestRouter(t)

	// Несуществующий пользователь — та же ошибка 401, что и неверный пароль
	rec := doJSON(t, router, http.MethodPost, "/api/v1/auth/login",
		`{"username":"ghost","password":"password123"}`)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
	require.Contains(t, rec.Body.String(), "неверный логин или пароль")
}

func TestAuth_Me_NoCookie(t *testing.T) {
	router := newTestRouter(t)
	rec := doJSON(t, router, http.MethodGet, "/api/v1/me", "")
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestAuth_Logout_Idempotent(t *testing.T) {
	router := newTestRouter(t)
	// Выход без сессии — 204, без ошибки
	rec := doJSON(t, router, http.MethodPost, "/api/v1/auth/logout", "")
	require.Equal(t, http.StatusNoContent, rec.Code)
}

func TestAuth_UsernameCaseInsensitive(t *testing.T) {
	router := newTestRouter(t)
	registerUser(t, router, "dave", "password123")

	// Вход с другим регистром логина — работает (нормализация в lowercase)
	rec := doJSON(t, router, http.MethodPost, "/api/v1/auth/login",
		`{"username":"DAVE","password":"password123"}`)
	require.Equal(t, http.StatusOK, rec.Code)
}
