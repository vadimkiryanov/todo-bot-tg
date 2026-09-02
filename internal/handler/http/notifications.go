package http

import (
	"net/http"

	errs "todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/handler/http/dto"
	"todo-bot-tg/internal/httperr"
	"todo-bot-tg/internal/middleware"
)

// listNotifications обрабатывает GET /api/v1/notifications → [Notification].
// Возвращает последние записи журнала «пришедших уведомлений» (свежие сверху).
func (h *todoHandler) listNotifications(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.ListNotifications(middleware.UserID(r.Context()))
	if err != nil {
		httperr.Write(w, err)
		return
	}

	resp := make([]dto.NotificationResponse, 0, len(items))
	for _, n := range items {
		resp = append(resp, dto.ToNotificationResponse(n))
	}
	writeJSON(w, http.StatusOK, resp)
}

// markNotificationsRead обрабатывает POST /api/v1/notifications/read
// {ids?: [number]} → 200. Пустой ids (или отсутствующий) — прочитать все.
func (h *todoHandler) markNotificationsRead(w http.ResponseWriter, r *http.Request) {
	var input dto.NotificationsReadRequest
	// Тело опционально: без него помечаем прочитанными все уведомления.
	if r.ContentLength > 0 {
		if err := decodeJSON(r, &input); err != nil {
			httperr.Write(w, errs.ErrInvalidJSON)
			return
		}
	}

	if err := h.svc.MarkNotificationsRead(middleware.UserID(r.Context()), input.Ids); err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
