package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	repo "todo-bot-tg/internal/repository/todo"
	"todo-bot-tg/internal/service/todo"
	"todo-bot-tg/internal/session"
	"todo-bot-tg/internal/storage/fs"
)

// newTestRouterWithService собирает роутер на in-memory хранилище и возвращает
// сервис: интеграционные тесты уведомлений сами «прозванивают» напоминания.
func newTestRouterWithService(t *testing.T) (http.Handler, *todo.Service) {
	t.Helper()
	store := repo.NewMemStore()
	fileStore, err := fs.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("fs.NewStore() error: %v", err)
	}
	svc := todo.NewService(store, store, store, store, store, store, fileStore)
	router := NewRouter(store, session.NewMemoryStore(), svc, session.TTL, true, "test-bot-token")
	return router, svc
}

// fireReminder «прозванивает» просроченные напоминания, как воркер: ежедневные
// переносятся на +24ч, и каждое срабатывание пишется в журнал уведомлений.
func fireReminder(t *testing.T, svc *todo.Service) {
	t.Helper()
	notes, err := svc.ProcessPendingReminders()
	require.NoError(t, err)
	require.NotEmpty(t, notes, "напоминание должно сработать")
}

// --- Эндпоинты уведомлений ---

func TestNotifications_Flow(t *testing.T) {
	router, svc := newTestRouterWithService(t)
	cookie := registerUser(t, router, "notif_user", "password123")
	topic := createTopic(t, router, cookie, "Топик")
	note := createNote(t, router, cookie, topic.ID, "Напоминание")

	// Уведомлений пока нет
	rec := doJSON(t, router, http.MethodGet, "/api/v1/notifications", "", cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	require.JSONEq(t, `[]`, rec.Body.String())

	// Ежедневное напоминание в прошлом → принимается (once в прошлом нельзя)
	past := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
	rec = doJSON(t, router, http.MethodPut,
		fmt.Sprintf("/api/v1/notes/%d/reminder", note.ID),
		fmt.Sprintf(`{"at":%q,"repeat":"daily"}`, past), cookie)
	require.Equal(t, http.StatusOK, rec.Code, "тело: %s", rec.Body.String())

	// Воркер «прозвонил» напоминание — в журнале появилась запись
	fireReminder(t, svc)
	rec = doJSON(t, router, http.MethodGet, "/api/v1/notifications", "", cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	var items []struct {
		ID      int64  `json:"id"`
		NoteID  int64  `json:"note_id"`
		Text    string `json:"text"`
		FiredAt string `json:"fired_at"`
		Read    bool   `json:"read"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &items))
	require.Len(t, items, 1)
	require.Equal(t, note.ID, items[0].NoteID)
	require.Equal(t, "Напоминание", items[0].Text)
	require.False(t, items[0].Read)
	require.NotEmpty(t, items[0].FiredAt)

	// Повторный прозвон не дублирует запись (напоминание перенесено на +24ч)
	_, err := svc.ProcessPendingReminders()
	require.NoError(t, err)
	rec = doJSON(t, router, http.MethodGet, "/api/v1/notifications", "", cookie)
	var again []map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &again))
	require.Len(t, again, 1)

	// «Прочитать все» → read=true
	rec = doJSON(t, router, http.MethodPost, "/api/v1/notifications/read", `{}`, cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	rec = doJSON(t, router, http.MethodGet, "/api/v1/notifications", "", cookie)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &items))
	require.True(t, items[0].Read)

	// Без сессии → 401
	rec = doJSON(t, router, http.MethodGet, "/api/v1/notifications", "")
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestNotifications_IsolationBetweenUsers(t *testing.T) {
	router, svc := newTestRouterWithService(t)
	alice := registerUser(t, router, "alice_n", "password123")
	bob := registerUser(t, router, "bob_n", "password123")

	for _, cookie := range []*http.Cookie{alice, bob} {
		topic := createTopic(t, router, cookie, "Топик")
		past := time.Now().Add(-time.Minute).UTC().Format(time.RFC3339)
		note := createNote(t, router, cookie, topic.ID, "С напоминанием")
		rec := doJSON(t, router, http.MethodPut,
			fmt.Sprintf("/api/v1/notes/%d/reminder", note.ID),
			fmt.Sprintf(`{"at":%q,"repeat":"daily"}`, past), cookie)
		require.Equal(t, http.StatusOK, rec.Code)
	}
	fireReminder(t, svc) // обрабатывает напоминания обоих

	for _, cookie := range []*http.Cookie{alice, bob} {
		rec := doJSON(t, router, http.MethodGet, "/api/v1/notifications", "", cookie)
		require.Equal(t, http.StatusOK, rec.Code)
		var items []map[string]any
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &items))
		require.Len(t, items, 1, "каждый видит только свои уведомления")
	}
}

// --- Таймеры и заметка по id ---

func TestNotes_TimersList(t *testing.T) {
	router := newTestRouter(t)
	cookie := registerUser(t, router, "timers_user", "password123")
	t1 := createTopic(t, router, cookie, "Один")
	t2 := createTopic(t, router, cookie, "Два")

	future := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
	later := time.Now().Add(3 * time.Hour).UTC().Format(time.RFC3339)
	createNote(t, router, cookie, t1.ID, "Без таймера")
	createNote(t, router, cookie, t1.ID, "Скоро")
	createNote(t, router, cookie, t2.ID, "Позже")

	for _, tc := range []struct {
		text string
		at   string
	}{{"Скоро", future}, {"Позже", later}} {
		// Найдём заметку по тексту через список топика.
		notes := listNotesByText(t, router, cookie, tc.text)
		require.Len(t, notes, 1)
		rec := doJSON(t, router, http.MethodPut,
			fmt.Sprintf("/api/v1/notes/%d/reminder", notes[0].ID),
			fmt.Sprintf(`{"at":%q,"repeat":"once"}`, tc.at), cookie)
		require.Equal(t, http.StatusOK, rec.Code, "тело: %s", rec.Body.String())
	}

	rec := doJSON(t, router, http.MethodGet, "/api/v1/notes?timers=true", "", cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	var notes []dtoNoteRef
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &notes))
	require.Len(t, notes, 2)
	// Сортировка по времени напоминания: «Скоро» раньше «Позже»
	require.Equal(t, "Скоро", notes[0].Text)
	require.Equal(t, "Позже", notes[1].Text)
	require.NotNil(t, notes[0].ReminderAt)
}

func TestNotes_GetById(t *testing.T) {
	router := newTestRouter(t)
	cookie := registerUser(t, router, "getnote_user", "password123")
	other := registerUser(t, router, "getnote_other", "password123")
	topic := createTopic(t, router, cookie, "Топик")
	note := createNote(t, router, cookie, topic.ID, "Найди меня")

	rec := doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/api/v1/notes/%d", note.ID), "", cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	var got dtoNoteRef
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, note.ID, got.ID)
	require.Equal(t, "Найди меня", got.Text)

	// Чужая заметка → 404; несуществующая → 404
	rec = doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/api/v1/notes/%d", note.ID), "", other)
	require.Equal(t, http.StatusNotFound, rec.Code)
	rec = doJSON(t, router, http.MethodGet, "/api/v1/notes/999", "", cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

// dtoNoteRef — минимальное DTO заметки для проверок JSON.
type dtoNoteRef struct {
	ID         int64   `json:"id"`
	Text       string  `json:"text"`
	ReminderAt *string `json:"reminder_at"`
}

// listNotesByText ищет заметку по тексту в списке топика.
func listNotesByText(t *testing.T, router http.Handler, cookie *http.Cookie, text string) []dtoNoteRef {
	t.Helper()
	rec := doJSON(t, router, http.MethodGet, "/api/v1/notes", "", cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	var notes []dtoNoteRef
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &notes))
	var out []dtoNoteRef
	for _, n := range notes {
		if n.Text == text {
			out = append(out, n)
		}
	}
	return out
}
