package http

import (
	"net/http"
	"net/http/httptest"
	"testing"

	repo "todo-bot-tg/internal/repository/todo"
	"todo-bot-tg/internal/session"
)

// newTestRouter собирает роутер на in-memory хранилищах (как в dev без БД).
func newTestRouter() http.Handler {
	store := repo.NewMemStore()
	return NewRouter(store, session.NewMemoryStore())
}

func TestRouter_Healthz(t *testing.T) {
	router := newTestRouter()
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
	router := newTestRouter()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/nope", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}
