package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"todo-bot-tg/internal/handler/http/dto"
)

// createTopic создаёт топик через API и возвращает его.
func createTopic(t *testing.T, router http.Handler, cookie *http.Cookie, name string) dto.TopicResponse {
	t.Helper()
	rec := doJSON(t, router, http.MethodPost, "/api/v1/topics",
		fmt.Sprintf(`{"name":%q}`, name), cookie)
	require.Equal(t, http.StatusCreated, rec.Code, "тело: %s", rec.Body.String())
	var topic dto.TopicResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &topic))
	require.Positive(t, topic.ID)
	return topic
}

func TestTopics_CRUD(t *testing.T) {
	router := newTestRouter(t)
	cookie := registerUser(t, router, "topics_user", "password123")

	// Создание → 201 {id, name, note_count: 0}
	topic := createTopic(t, router, cookie, "Работа")
	require.Equal(t, "Работа", topic.Name)
	require.Zero(t, topic.NoteCount)

	// Список → 1 топик
	rec := doJSON(t, router, http.MethodGet, "/api/v1/topics", "", cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	var list []dto.TopicResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &list))
	require.Len(t, list, 1)
	require.Equal(t, topic.ID, list[0].ID)

	// Переименование → 200 с новым именем
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/topics/%d", topic.ID), `{"name":"Личное"}`, cookie)
	require.Equal(t, http.StatusOK, rec.Code, "тело: %s", rec.Body.String())
	var renamed dto.TopicResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &renamed))
	require.Equal(t, "Личное", renamed.Name)

	// Удаление → 204, список пуст
	rec = doJSON(t, router, http.MethodDelete,
		fmt.Sprintf("/api/v1/topics/%d", topic.ID), "", cookie)
	require.Equal(t, http.StatusNoContent, rec.Code)

	rec = doJSON(t, router, http.MethodGet, "/api/v1/topics", "", cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &list))
	require.Empty(t, list)
}

func TestTopics_Errors(t *testing.T) {
	router := newTestRouter(t)
	cookie := registerUser(t, router, "topics_errors", "password123")
	topic := createTopic(t, router, cookie, "Единственный")

	// Без сессии → 401
	rec := doJSON(t, router, http.MethodGet, "/api/v1/topics", "")
	require.Equal(t, http.StatusUnauthorized, rec.Code)
	rec = doJSON(t, router, http.MethodPost, "/api/v1/topics", `{"name":"X"}`)
	require.Equal(t, http.StatusUnauthorized, rec.Code)

	// Пустое имя → 400
	rec = doJSON(t, router, http.MethodPost, "/api/v1/topics", `{"name":""}`, cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/topics/%d", topic.ID), `{"name":""}`, cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	// Дубль имени → 409
	rec = doJSON(t, router, http.MethodPost, "/api/v1/topics", `{"name":"Единственный"}`, cookie)
	require.Equal(t, http.StatusConflict, rec.Code)

	// Несуществующий id → 404
	rec = doJSON(t, router, http.MethodPatch, "/api/v1/topics/999", `{"name":"Новый"}`, cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)
	rec = doJSON(t, router, http.MethodDelete, "/api/v1/topics/999", "", cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestTopics_IsolationBetweenUsers(t *testing.T) {
	router := newTestRouter(t)
	alice := registerUser(t, router, "alice_t", "password123")
	bob := registerUser(t, router, "bob_t", "password123")

	topic := createTopic(t, router, alice, "Приватный")

	// Боб не видит и не может менять чужой топик → 404
	rec := doJSON(t, router, http.MethodGet, "/api/v1/topics", "", bob)
	require.Equal(t, http.StatusOK, rec.Code)
	var list []dto.TopicResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &list))
	require.Empty(t, list)

	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/topics/%d", topic.ID), `{"name":"Взлом"}`, bob)
	require.Equal(t, http.StatusNotFound, rec.Code)

	rec = doJSON(t, router, http.MethodDelete,
		fmt.Sprintf("/api/v1/topics/%d", topic.ID), "", bob)
	require.Equal(t, http.StatusNotFound, rec.Code)

	// Алиса всё ещё видит свой топик
	rec = doJSON(t, router, http.MethodGet, "/api/v1/topics", "", alice)
	require.Equal(t, http.StatusOK, rec.Code)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &list))
	require.Len(t, list, 1)
}
