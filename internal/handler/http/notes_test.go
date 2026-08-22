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
	repo "todo-bot-tg/internal/repository/todo"
	"todo-bot-tg/internal/session"
)

// createNote создаёт заметку через API и возвращает её.
func createNote(t *testing.T, router http.Handler, cookie *http.Cookie, topicID int64, text string) dto.NoteResponse {
	t.Helper()
	rec := doJSON(t, router, http.MethodPost, "/api/v1/notes",
		fmt.Sprintf(`{"topic_id":%d,"text":%q}`, topicID, text), cookie)
	require.Equal(t, http.StatusCreated, rec.Code, "тело: %s", rec.Body.String())
	var note dto.NoteResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &note))
	require.Positive(t, note.ID)
	return note
}

func TestNotes_CRUD(t *testing.T) {
	router := newTestRouter(t)
	cookie := registerUser(t, router, "notes_user", "password123")
	topic := createTopic(t, router, cookie, "Покупки")

	// Создание → 201 {id, text, priority:"none", done:false, pinned:false, created_at}
	note := createNote(t, router, cookie, topic.ID, "Купить молоко")
	require.Equal(t, "Купить молоко", note.Text)
	require.Equal(t, "none", note.Priority)
	require.False(t, note.Done)
	require.False(t, note.Pinned)
	_, err := time.Parse(time.RFC3339, note.CreatedAt)
	require.NoError(t, err, "created_at должен быть ISO 8601 (RFC3339)")

	// note_count топика = 1
	rec := doJSON(t, router, http.MethodGet, "/api/v1/topics", "", cookie)
	var topics []dto.TopicResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &topics))
	require.Len(t, topics, 1)
	require.Equal(t, 1, topics[0].NoteCount)

	// Список по топику → 1 заметка
	rec = doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/api/v1/notes?topic_id=%d", topic.ID), "", cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	var notes []dto.NoteResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &notes))
	require.Len(t, notes, 1)
	require.Equal(t, note.ID, notes[0].ID)

	// PATCH text → 200 с обновлённым текстом
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/notes/%d", note.ID), `{"text":"Купить хлеб"}`, cookie)
	require.Equal(t, http.StatusOK, rec.Code, "тело: %s", rec.Body.String())
	var updated dto.NoteResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &updated))
	require.Equal(t, "Купить хлеб", updated.Text)

	// PATCH done=true → 200 с done:true
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/notes/%d", note.ID), `{"done":true}`, cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &updated))
	require.True(t, updated.Done)

	// PATCH done=false → 200 с done:false
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/notes/%d", note.ID), `{"done":false}`, cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &updated))
	require.False(t, updated.Done)

	// PATCH priority=high → 200 с priority:"high"
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/notes/%d", note.ID), `{"priority":"high"}`, cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &updated))
	require.Equal(t, "high", updated.Priority)

	// Удаление заметки → 204, список пуст, note_count = 0
	rec = doJSON(t, router, http.MethodDelete,
		fmt.Sprintf("/api/v1/notes/%d", note.ID), "", cookie)
	require.Equal(t, http.StatusNoContent, rec.Code)

	rec = doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/api/v1/notes?topic_id=%d", topic.ID), "", cookie)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &notes))
	require.Empty(t, notes)

	rec = doJSON(t, router, http.MethodGet, "/api/v1/topics", "", cookie)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &topics))
	require.Equal(t, 0, topics[0].NoteCount)

	// Удаление топика → 204
	rec = doJSON(t, router, http.MethodDelete,
		fmt.Sprintf("/api/v1/topics/%d", topic.ID), "", cookie)
	require.Equal(t, http.StatusNoContent, rec.Code)
}

func TestNotes_Errors(t *testing.T) {
	router := newTestRouter(t)
	cookie := registerUser(t, router, "notes_errors", "password123")
	topic := createTopic(t, router, cookie, "Топик")
	note := createNote(t, router, cookie, topic.ID, "Заметка")

	// Без сессии → 401
	rec := doJSON(t, router, http.MethodGet, "/api/v1/notes", "")
	require.Equal(t, http.StatusUnauthorized, rec.Code)
	rec = doJSON(t, router, http.MethodPost, "/api/v1/notes", `{"topic_id":1,"text":"x"}`)
	require.Equal(t, http.StatusUnauthorized, rec.Code)

	// Пустой текст → 400
	rec = doJSON(t, router, http.MethodPost, "/api/v1/notes",
		fmt.Sprintf(`{"topic_id":%d,"text":""}`, topic.ID), cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	// Пустой PATCH → 400
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/notes/%d", note.ID), `{}`, cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	// Кривой приоритет → 400
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/notes/%d", note.ID), `{"priority":"urgent"}`, cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	// Кривой topic_id в query → 400
	rec = doJSON(t, router, http.MethodGet, "/api/v1/notes?topic_id=abc", "", cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	// Несуществующая заметка → 404
	rec = doJSON(t, router, http.MethodPatch, "/api/v1/notes/999", `{"done":true}`, cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)
	rec = doJSON(t, router, http.MethodDelete, "/api/v1/notes/999", "", cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)

	// Чужой id в пути → 404
	rec = doJSON(t, router, http.MethodPatch, "/api/v1/notes/abc", `{"done":true}`, cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestNotes_IsolationBetweenUsers(t *testing.T) {
	router := newTestRouter(t)
	alice := registerUser(t, router, "alice_n", "password123")
	bob := registerUser(t, router, "bob_n", "password123")

	topic := createTopic(t, router, alice, "Алисин")
	note := createNote(t, router, alice, topic.ID, "Секрет")

	// Боб не видит заметку Алисы по её топику
	rec := doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/api/v1/notes?topic_id=%d", topic.ID), "", bob)
	require.Equal(t, http.StatusOK, rec.Code)
	var notes []dto.NoteResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &notes))
	require.Empty(t, notes)

	// Боб не может менять чужую заметку → 404
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/notes/%d", note.ID), `{"done":true}`, bob)
	require.Equal(t, http.StatusNotFound, rec.Code)
	rec = doJSON(t, router, http.MethodDelete,
		fmt.Sprintf("/api/v1/notes/%d", note.ID), "", bob)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

// stubTodoService — стаб сервиса для юнит-тестов PATCH: запоминает вызовы.
// Встраивание интерфейса позволяет не реализовывать неиспользуемые методы.
type stubTodoService struct {
	TodoService
	note   model.Note
	getErr error
	calls  []string
}

func (s *stubTodoService) EditNote(userID, noteID int64, text string, entities []model.NoteEntity) error {
	s.calls = append(s.calls, "edit:"+text)
	s.note.Text = text
	return nil
}

func (s *stubTodoService) MarkDone(userID, noteID int64) error {
	s.calls = append(s.calls, "done")
	s.note.Done = true
	return nil
}

func (s *stubTodoService) MarkUndone(userID, noteID int64) error {
	s.calls = append(s.calls, "undone")
	s.note.Done = false
	return nil
}

func (s *stubTodoService) SetPriority(userID, noteID int64, priority model.Priority) error {
	s.calls = append(s.calls, "priority:"+dto.PriorityString(priority))
	s.note.Priority = priority
	return nil
}

func (s *stubTodoService) GetNote(userID, noteID int64) (model.Note, error) {
	return s.note, s.getErr
}

func newPatchRouter(stub TodoService) http.Handler {
	return NewRouter(repo.NewMemStore(), session.NewMemoryStore(), stub, session.TTL, true, "test-bot-token")
}

func TestNotes_Patch_AppliesOnlyProvidedFields(t *testing.T) {
	stub := &stubTodoService{
		note: model.Note{ID: 7, Text: "старая", Priority: model.PriorityNone},
	}
	router := newPatchRouter(stub)
	cookie := registerUser(t, router, "patch_user", "password123")

	// Все поля разом → порядок text → done → priority
	rec := doJSON(t, router, http.MethodPatch, "/api/v1/notes/7",
		`{"text":"новая","done":true,"priority":"high"}`, cookie)
	require.Equal(t, http.StatusOK, rec.Code, "тело: %s", rec.Body.String())
	require.Equal(t, []string{"edit:новая", "done", "priority:high"}, stub.calls)

	// Ответ — актуальная заметка
	var note dto.NoteResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &note))
	require.Equal(t, "новая", note.Text)
	require.True(t, note.Done)
	require.Equal(t, "high", note.Priority)

	// done=false → undone, остальные поля не трогаются
	stub.calls = nil
	rec = doJSON(t, router, http.MethodPatch, "/api/v1/notes/7", `{"done":false}`, cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, []string{"undone"}, stub.calls)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &note))
	require.Equal(t, "новая", note.Text, "текст не должен меняться")
	require.Equal(t, "high", note.Priority, "приоритет не должен меняться")
}

func TestNotes_Patch_InvalidInput(t *testing.T) {
	stub := &stubTodoService{note: model.Note{ID: 7, Text: "т"}}
	router := newPatchRouter(stub)
	cookie := registerUser(t, router, "patch_bad", "password123")

	// Пустой PATCH → 400, сервис не вызывается
	rec := doJSON(t, router, http.MethodPatch, "/api/v1/notes/7", `{}`, cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Empty(t, stub.calls)

	// Кривой приоритет → 400, SetPriority не вызывается
	rec = doJSON(t, router, http.MethodPatch, "/api/v1/notes/7", `{"priority":"urgent"}`, cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Empty(t, stub.calls)
}
