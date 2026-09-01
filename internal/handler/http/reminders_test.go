package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"todo-bot-tg/internal/handler/http/dto"
	"todo-bot-tg/internal/model"
)

func TestReminders_SetAndClear(t *testing.T) {
	router := newTestRouter(t)
	cookie := registerUser(t, router, "reminder_user", "password123")
	topic := createTopic(t, router, cookie, "Топик")
	note := createNote(t, router, cookie, topic.ID, "Заметка")

	// Новая заметка — без напоминания
	require.Nil(t, note.ReminderAt)
	require.Equal(t, "once", note.ReminderRepeat)

	future := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)

	// PUT once → 200 с reminder_at и repeat
	rec := doJSON(t, router, http.MethodPut,
		fmt.Sprintf("/api/v1/notes/%d/reminder", note.ID),
		fmt.Sprintf(`{"at":%q,"repeat":"once"}`, future), cookie)
	require.Equal(t, http.StatusOK, rec.Code, "тело: %s", rec.Body.String())
	var updated dto.NoteResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &updated))
	require.NotNil(t, updated.ReminderAt)
	require.Equal(t, "once", updated.ReminderRepeat)

	// Перезапись на daily → 200, repeat поменялся
	rec = doJSON(t, router, http.MethodPut,
		fmt.Sprintf("/api/v1/notes/%d/reminder", note.ID),
		fmt.Sprintf(`{"at":%q,"repeat":"daily"}`, future), cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &updated))
	require.Equal(t, "daily", updated.ReminderRepeat)

	// Напоминание видно в списке заметок топика
	rec = doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/api/v1/notes?topic_id=%d", topic.ID), "", cookie)
	var notes []dto.NoteResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &notes))
	require.Len(t, notes, 1)
	require.NotNil(t, notes[0].ReminderAt)

	// DELETE → 200, reminder_at:null
	rec = doJSON(t, router, http.MethodDelete,
		fmt.Sprintf("/api/v1/notes/%d/reminder", note.ID), "", cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &updated))
	require.Nil(t, updated.ReminderAt)
}

func TestReminders_Errors(t *testing.T) {
	router := newTestRouter(t)
	cookie := registerUser(t, router, "reminder_err", "password123")
	topic := createTopic(t, router, cookie, "Топик")
	note := createNote(t, router, cookie, topic.ID, "Заметка")

	future := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
	past := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)

	// once в прошлом → 400
	rec := doJSON(t, router, http.MethodPut,
		fmt.Sprintf("/api/v1/notes/%d/reminder", note.ID),
		fmt.Sprintf(`{"at":%q,"repeat":"once"}`, past), cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	// daily в прошлом → ок (проверки прошлого нет)
	rec = doJSON(t, router, http.MethodPut,
		fmt.Sprintf("/api/v1/notes/%d/reminder", note.ID),
		fmt.Sprintf(`{"at":%q,"repeat":"daily"}`, past), cookie)
	require.Equal(t, http.StatusOK, rec.Code)

	// Кривой repeat → 400
	rec = doJSON(t, router, http.MethodPut,
		fmt.Sprintf("/api/v1/notes/%d/reminder", note.ID),
		fmt.Sprintf(`{"at":%q,"repeat":"weekly"}`, future), cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	// Кривой at → 400
	rec = doJSON(t, router, http.MethodPut,
		fmt.Sprintf("/api/v1/notes/%d/reminder", note.ID),
		`{"at":"не-дата","repeat":"once"}`, cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	// Несуществующая заметка → 404
	rec = doJSON(t, router, http.MethodPut, "/api/v1/notes/999/reminder",
		fmt.Sprintf(`{"at":%q,"repeat":"once"}`, future), cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)

	// Чужой id в пути → 404
	rec = doJSON(t, router, http.MethodPut, "/api/v1/notes/abc/reminder",
		fmt.Sprintf(`{"at":%q,"repeat":"once"}`, future), cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)

	// Без сессии → 401
	rec = doJSON(t, router, http.MethodPut,
		fmt.Sprintf("/api/v1/notes/%d/reminder", note.ID),
		fmt.Sprintf(`{"at":%q,"repeat":"once"}`, future))
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestReminders_IsolationBetweenUsers(t *testing.T) {
	router := newTestRouter(t)
	alice := registerUser(t, router, "alice_r", "password123")
	bob := registerUser(t, router, "bob_r", "password123")

	topic := createTopic(t, router, alice, "Алисин")
	note := createNote(t, router, alice, topic.ID, "Секрет")

	future := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)

	// Боб не может поставить напоминание на чужую заметку → 404
	rec := doJSON(t, router, http.MethodPut,
		fmt.Sprintf("/api/v1/notes/%d/reminder", note.ID),
		fmt.Sprintf(`{"at":%q,"repeat":"once"}`, future), bob)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

// SetReminder/ClearReminder для stubTodoService — юнит-тест reminder-хендлеров.
func (s *stubTodoService) SetReminder(userID, noteID int64, at time.Time, repeat model.ReminderRepeat) error {
	s.calls = append(s.calls, "setreminder:"+string(repeat))
	s.note.ReminderAt = &at
	s.note.ReminderRepeat = repeat
	return nil
}

func (s *stubTodoService) ClearReminder(userID, noteID int64) error {
	s.calls = append(s.calls, "clearreminder")
	s.note.ReminderAt = nil
	s.note.ReminderRepeat = model.ReminderRepeatOnce
	return nil
}

func TestReminders_Handler(t *testing.T) {
	stub := &stubTodoService{note: model.Note{ID: 7, Text: "т"}}
	router := newPatchRouter(stub)
	cookie := registerUser(t, router, "reminder_stub", "password123")

	future := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)

	// PUT → сервис вызван с repeat, ответ — актуальная заметка
	rec := doJSON(t, router, http.MethodPut, "/api/v1/notes/7/reminder",
		fmt.Sprintf(`{"at":%q,"repeat":"daily"}`, future), cookie)
	require.Equal(t, http.StatusOK, rec.Code, "тело: %s", rec.Body.String())
	require.Equal(t, []string{"setreminder:daily"}, stub.calls)

	var note dto.NoteResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &note))
	require.NotNil(t, note.ReminderAt)
	require.Equal(t, "daily", note.ReminderRepeat)

	// DELETE → clearReminder, ответ без напоминания
	stub.calls = nil
	rec = doJSON(t, router, http.MethodDelete, "/api/v1/notes/7/reminder", "", cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, []string{"clearreminder"}, stub.calls)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &note))
	require.Nil(t, note.ReminderAt)

	// Кривой repeat → 400, сервис не вызывается
	stub.calls = nil
	rec = doJSON(t, router, http.MethodPut, "/api/v1/notes/7/reminder",
		fmt.Sprintf(`{"at":%q,"repeat":"weekly"}`, future), cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Empty(t, stub.calls)

	// Кривой at → 400, сервис не вызывается
	rec = doJSON(t, router, http.MethodPut, "/api/v1/notes/7/reminder",
		`{"at":"мусор","repeat":"once"}`, cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Empty(t, stub.calls)
}
