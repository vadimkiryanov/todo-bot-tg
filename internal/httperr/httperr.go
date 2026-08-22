package httperr

import (
	"encoding/json"
	"errors"
	"net/http"

	errs "todo-bot-tg/internal/errors"
)

// ErrInternal — внутренняя ошибка сервера. Клиенту не раскрываются детали
// (паника, ошибка БД), только общий текст.
var ErrInternal = errors.New("внутренняя ошибка сервера")

// response — единый формат ошибки API: {"error": "..."}.
type response struct {
	Error string `json:"error"`
}

// Status сопоставляет sentinel-ошибку домена HTTP-статусу.
func Status(err error) int {
	switch {
	case errors.Is(err, errs.ErrNotFound),
		errors.Is(err, errs.ErrTopicNotFound),
		errors.Is(err, errs.ErrNoteNotFound),
		errors.Is(err, errs.ErrFolderNotFound),
		errors.Is(err, errs.ErrAttachmentNotFound),
		errors.Is(err, errs.ErrSettingsNotFound):
		return http.StatusNotFound

	case errors.Is(err, errs.ErrTopicAlreadyExists),
		errors.Is(err, errs.ErrFolderAlreadyExists),
		errors.Is(err, errs.ErrNotEnoughParts):
		return http.StatusConflict

	case errors.Is(err, errs.ErrEmptyText),
		errors.Is(err, errs.ErrEmptyName),
		errors.Is(err, errs.ErrEmptyFolderName),
		errors.Is(err, errs.ErrInvalidPriority),
		errors.Is(err, errs.ErrInvalidReminderRepeat):
		return http.StatusBadRequest

	default:
		return http.StatusInternalServerError
	}
}

// Write записывает ошибку в ответ в едином JSON-формате.
func Write(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(Status(err))
	_ = json.NewEncoder(w).Encode(response{Error: err.Error()})
}
