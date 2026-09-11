package http

import (
	"net/http"
	"strconv"

	errs "todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/handler/http/dto"
	"todo-bot-tg/internal/httperr"
	"todo-bot-tg/internal/middleware"
)

// listTopics обрабатывает GET /api/v1/topics → [{id, name, note_count, pinned}].
func (h *todoHandler) listTopics(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserID(r.Context())

	topics, err := h.svc.ListTopics(userID)
	if err != nil {
		httperr.Write(w, err)
		return
	}

	// Закреплённые топики = быстрые топики пользователя (та же строка кнопок
	// в боте): в ответе помечаем их флагом pinned.
	quickIDs, err := h.svc.ListQuickTopicIDs(userID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	pinned := make(map[int64]bool, len(quickIDs))
	for _, id := range quickIDs {
		pinned[id] = true
	}

	resp := make([]dto.TopicResponse, 0, len(topics))
	for _, t := range topics {
		count, err := h.svc.CountNotes(userID, t.ID, nil)
		if err != nil {
			httperr.Write(w, err)
			return
		}
		resp = append(resp, dto.ToTopicResponse(t, count, pinned[t.ID]))
	}
	writeJSON(w, http.StatusOK, resp)
}

// createTopic обрабатывает POST /api/v1/topics {name} → 201 Topic.
func (h *todoHandler) createTopic(w http.ResponseWriter, r *http.Request) {
	var input dto.TopicRequest
	if err := decodeJSON(r, &input); err != nil {
		httperr.Write(w, errs.ErrInvalidJSON)
		return
	}
	if input.Name == "" {
		httperr.Write(w, errs.ErrEmptyName)
		return
	}

	t, err := h.svc.CreateTopic(middleware.UserID(r.Context()), input.Name)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	// Новый топик не закреплён — пустой список закреплённых по определению.
	writeJSON(w, http.StatusCreated, dto.ToTopicResponse(t, 0, false))
}

// patchTopic обрабатывает PATCH /api/v1/topics/{id} {name?, pinned?} → 200 Topic.
// Name и Pinned независимы: можно передать одно из них или оба сразу;
// запрос без обоих полей — 400 (нечего менять).
func (h *todoHandler) patchTopic(w http.ResponseWriter, r *http.Request) {
	topicID, err := pathID(r)
	if err != nil {
		httperr.Write(w, err)
		return
	}

	var input dto.TopicRequest
	if err := decodeJSON(r, &input); err != nil {
		httperr.Write(w, errs.ErrInvalidJSON)
		return
	}
	if input.Name == "" && input.Pinned == nil {
		httperr.Write(w, errs.ErrEmptyName)
		return
	}

	userID := middleware.UserID(r.Context())

	t, err := h.svc.GetTopic(userID, topicID)
	if err != nil {
		httperr.Write(w, err)
		return
	}

	if input.Name != "" {
		renamed, err := h.svc.RenameTopic(userID, topicID, input.Name)
		if err != nil {
			httperr.Write(w, err)
			return
		}
		t = renamed
	}

	pinned, err := h.isTopicPinned(userID, topicID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	if input.Pinned != nil && *input.Pinned != pinned {
		if *input.Pinned {
			err = h.svc.PinTopic(userID, topicID)
		} else {
			err = h.svc.UnpinTopic(userID, topicID)
		}
		if err != nil {
			httperr.Write(w, err)
			return
		}
		pinned = *input.Pinned
	}

	count, err := h.svc.CountNotes(userID, t.ID, nil)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, dto.ToTopicResponse(t, count, pinned))
}

// isTopicPinned сообщает, входит ли топик в закреплённые (быстрые) топики.
func (h *todoHandler) isTopicPinned(userID, topicID int64) (bool, error) {
	ids, err := h.svc.ListQuickTopicIDs(userID)
	if err != nil {
		return false, err
	}
	for _, id := range ids {
		if id == topicID {
			return true, nil
		}
	}
	return false, nil
}

// deleteTopic обрабатывает DELETE /api/v1/topics/{id} → 204.
func (h *todoHandler) deleteTopic(w http.ResponseWriter, r *http.Request) {
	topicID, err := pathID(r)
	if err != nil {
		httperr.Write(w, err)
		return
	}

	if err := h.svc.DeleteTopic(middleware.UserID(r.Context()), topicID); err != nil {
		httperr.Write(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// pathID извлекает числовой {id} из пути маршрута.
// Невалидный или неположительный id трактуется как отсутствующий ресурс (404).
func pathID(r *http.Request) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		return 0, errs.ErrNotFound
	}
	return id, nil
}
