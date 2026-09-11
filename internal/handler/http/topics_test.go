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

// listTopicsFor возвращает список топиков пользователя.
func listTopicsFor(t *testing.T, router http.Handler, cookie *http.Cookie) []dto.TopicResponse {
	t.Helper()
	rec := doJSON(t, router, http.MethodGet, "/api/v1/topics", "", cookie)
	require.Equal(t, http.StatusOK, rec.Code)
	var list []dto.TopicResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &list))
	return list
}

func TestTopics_Pin(t *testing.T) {
	router := newTestRouter(t)
	cookie := registerUser(t, router, "topics_pin", "password123")
	topic := createTopic(t, router, cookie, "Работа")

	require.False(t, listTopicsFor(t, router, cookie)[0].Pinned, "новый топик не закреплён")

	// Закреп → 200 {pinned:true}, в списке флаг тоже true
	rec := doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/topics/%d", topic.ID), `{"pinned":true}`, cookie)
	require.Equal(t, http.StatusOK, rec.Code, "тело: %s", rec.Body.String())
	var pinned dto.TopicResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &pinned))
	require.True(t, pinned.Pinned)
	require.Equal(t, "Работа", pinned.Name, "переименование не затронуто")
	require.True(t, listTopicsFor(t, router, cookie)[0].Pinned)

	// Повторный закреп — no-op, без ошибки и дублей
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/topics/%d", topic.ID), `{"pinned":true}`, cookie)
	require.Equal(t, http.StatusOK, rec.Code)

	// Переименование и закреп одним запросом
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/topics/%d", topic.ID), `{"name":"Личное","pinned":true}`, cookie)
	require.Equal(t, http.StatusOK, rec.Code, "тело: %s", rec.Body.String())
	var both dto.TopicResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &both))
	require.Equal(t, "Личное", both.Name)
	require.True(t, both.Pinned)

	// Откреп → 200 {pinned:false}
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/topics/%d", topic.ID), `{"pinned":false}`, cookie)
	require.Equal(t, http.StatusOK, rec.Code, "тело: %s", rec.Body.String())
	var unpinned dto.TopicResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &unpinned))
	require.False(t, unpinned.Pinned)
	require.False(t, listTopicsFor(t, router, cookie)[0].Pinned)

	// Повторное открепление — тоже no-op
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/topics/%d", topic.ID), `{"pinned":false}`, cookie)
	require.Equal(t, http.StatusOK, rec.Code)
}

func TestTopics_PinErrors(t *testing.T) {
	router := newTestRouter(t)
	cookie := registerUser(t, router, "topics_pin_err", "password123")
	topic := createTopic(t, router, cookie, "Работа")

	// Пустое тело (ни name, ни pinned) → 400
	rec := doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/topics/%d", topic.ID), `{}`, cookie)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	// Несуществующий топик → 404
	rec = doJSON(t, router, http.MethodPatch, "/api/v1/topics/999", `{"pinned":true}`, cookie)
	require.Equal(t, http.StatusNotFound, rec.Code)

	// Чужой топик → 404 и он остаётся незакреплённым у владельца
	bob := registerUser(t, router, "topics_pin_bob", "password123")
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/topics/%d", topic.ID), `{"pinned":true}`, bob)
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.False(t, listTopicsFor(t, router, cookie)[0].Pinned)

	// Предел: больше десяти закрепов нельзя (11-й → 409)
	for i := 0; i < 10; i++ {
		extra := createTopic(t, router, cookie, fmt.Sprintf("Топик %d", i))
		rec = doJSON(t, router, http.MethodPatch,
			fmt.Sprintf("/api/v1/topics/%d", extra.ID), `{"pinned":true}`, cookie)
		require.Equal(t, http.StatusOK, rec.Code, "тело: %s", rec.Body.String())
	}
	eleventh := createTopic(t, router, cookie, "Одиннадцатый")
	rec = doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/api/v1/topics/%d", eleventh.ID), `{"pinned":true}`, cookie)
	require.Equal(t, http.StatusConflict, rec.Code)
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
