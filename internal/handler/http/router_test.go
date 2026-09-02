package http

import (
	"net/http"
	"net/http/httptest"
	"testing"

	repo "todo-bot-tg/internal/repository/todo"
	"todo-bot-tg/internal/service/todo"
	"todo-bot-tg/internal/session"
	"todo-bot-tg/internal/storage/fs"
)

// newTestRouter собирает роутер на in-memory хранилищах (как в dev без БД).
func newTestRouter(t *testing.T) http.Handler {
	t.Helper()
	store := repo.NewMemStore()
	fileStore, err := fs.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("fs.NewStore() error: %v", err)
	}
	svc := todo.NewService(store, store, store, store, store, store, fileStore)
	return NewRouter(store, session.NewMemoryStore(), svc, session.TTL, true, "test-bot-token")
}

// newTestRouterCookieSecure собирает роутер с заданным флагом Secure для cookie.
func newTestRouterCookieSecure(t *testing.T, cookieSecure bool) http.Handler {
	t.Helper()
	store := repo.NewMemStore()
	fileStore, err := fs.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("fs.NewStore() error: %v", err)
	}
	svc := todo.NewService(store, store, store, store, store, store, fileStore)
	return NewRouter(store, session.NewMemoryStore(), svc, session.TTL, cookieSecure, "test-bot-token")
}

// newTestRouterTgDisabled собирает роутер с отключённым входом через Telegram.
func newTestRouterTgDisabled(t *testing.T) http.Handler {
	t.Helper()
	store := repo.NewMemStore()
	fileStore, err := fs.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("fs.NewStore() error: %v", err)
	}
	svc := todo.NewService(store, store, store, store, store, store, fileStore)
	return NewRouter(store, session.NewMemoryStore(), svc, session.TTL, true, "")
}

func TestRouter_Healthz(t *testing.T) {
	router := newTestRouter(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if want := `{"status":"ok"}`; rec.Body.String() != want {
		t.Errorf("body = %q, want %q", rec.Body.String(), want)
	}
}

func TestRouter_UnknownRoute_404(t *testing.T) {
	router := newTestRouter(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/nope", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}
