package http

import (
	"net/http"
	"strconv"
	"time"

	errs "todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/handler/http/dto"
	"todo-bot-tg/internal/httperr"
	"todo-bot-tg/internal/middleware"
	"todo-bot-tg/internal/model"
	"todo-bot-tg/internal/service/todo"
)

// listNotes обрабатывает GET /api/v1/notes?topic_id=N&folder_id=X → [Note].
// topic_id опционален: без него возвращаются заметки без топика.
// archived=true → архивные заметки пользователя (без фильтра по топику).
// done=true → выполненные заметки пользователя (без фильтра по топику).
// В основном списке выполненные заметки скрыты — они «складируются» в done=true.
func (h *todoHandler) listNotes(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserID(r.Context())

	var notes []model.Note
	var err error
	switch {
	case r.URL.Query().Get("archived") == "true":
		notes, err = h.svc.ListArchived(userID)
	case r.URL.Query().Get("done") == "true":
		notes, err = h.svc.ListDone(userID)
	default:
		var topicID int64
		if q := r.URL.Query().Get("topic_id"); q != "" {
			id, parseErr := strconv.ParseInt(q, 10, 64)
			if parseErr != nil || id <= 0 {
				httperr.Write(w, errs.ErrInvalidJSON)
				return
			}
			topicID = id
		}
		var folderID *int64
		if q := r.URL.Query().Get("folder_id"); q != "" {
			id, parseErr := strconv.ParseInt(q, 10, 64)
			if parseErr != nil || id <= 0 {
				httperr.Write(w, errs.ErrInvalidJSON)
				return
			}
			folderID = &id
		}
		notes, err = h.svc.ListNotes(userID, topicID, folderID)
		if err == nil {
			// Выполненные скрываем из основного списка (только в «done=true»),
			// как бот скрывает их из списка заметок.
			active := notes[:0]
			for _, n := range notes {
				if !n.Done {
					active = append(active, n)
				}
			}
			notes = active
		}
	}
	if err != nil {
		httperr.Write(w, err)
		return
	}

	resp := make([]dto.NoteResponse, 0, len(notes))
	for _, n := range notes {
		resp = append(resp, dto.ToNoteResponse(n))
	}
	writeJSON(w, http.StatusOK, resp)
}

// createNote обрабатывает POST /api/v1/notes {topic_id, folder_id?, text} → 201 Note.
// Разметка **bold**/*italic*/`code`/[text](url) конвертируется в entities.
func (h *todoHandler) createNote(w http.ResponseWriter, r *http.Request) {
	var input dto.NoteCreateRequest
	if err := decodeJSON(r, &input); err != nil {
		httperr.Write(w, errs.ErrInvalidJSON)
		return
	}
	if input.Text == "" {
		httperr.Write(w, errs.ErrEmptyText)
		return
	}

	text, entities := parseMarkdownEntities(input.Text)

	priority := model.PriorityNone
	if input.Priority != nil {
		p, parseErr := dto.ParsePriority(*input.Priority)
		if parseErr != nil {
			httperr.Write(w, parseErr)
			return
		}
		priority = p
	}

	var opts []todo.AddNoteOptions
	if input.Done != nil || input.Pinned != nil || input.ReminderAt != nil {
		opt := todo.AddNoteOptions{}
		if input.Done != nil {
			opt.Done = *input.Done
		}
		if input.Pinned != nil {
			opt.Pinned = *input.Pinned
		}
		if input.ReminderAt != nil {
			at, parseErr := time.Parse(time.RFC3339, *input.ReminderAt)
			if parseErr != nil {
				httperr.Write(w, errs.ErrInvalidJSON)
				return
			}
			repeat := model.ReminderRepeatOnce
			if input.ReminderRepeat != nil {
				var repeatErr error
				repeat, repeatErr = model.NewReminderRepeat(*input.ReminderRepeat)
				if repeatErr != nil {
					httperr.Write(w, repeatErr)
					return
				}
			}
			// Одноразовое напоминание не может быть в прошлом (как в боте).
			if repeat == model.ReminderRepeatOnce && !at.After(time.Now().UTC()) {
				httperr.Write(w, errs.ErrReminderInPast)
				return
			}
			opt.ReminderAt = &at
			opt.ReminderRepeat = repeat
		}
		opts = []todo.AddNoteOptions{opt}
	}

	n, err := h.svc.AddNote(middleware.UserID(r.Context()), input.TopicID, input.FolderID, text, entities, priority, opts...)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, dto.ToNoteResponse(n))
}

// moveNote обрабатывает POST /api/v1/notes/{id}/move {topic_id, folder_id?} → 200 Note.
// folder_id null/отсутствует — заметка перемещается в корень топика.
func (h *todoHandler) moveNote(w http.ResponseWriter, r *http.Request) {
	noteID, err := pathID(r)
	if err != nil {
		httperr.Write(w, err)
		return
	}

	var input dto.NoteMoveRequest
	if err := decodeJSON(r, &input); err != nil {
		httperr.Write(w, errs.ErrInvalidJSON)
		return
	}
	if input.TopicID <= 0 {
		httperr.Write(w, errs.ErrInvalidJSON)
		return
	}

	userID := middleware.UserID(r.Context())
	if err := h.svc.MoveNote(userID, noteID, input.TopicID, input.FolderID); err != nil {
		httperr.Write(w, err)
		return
	}

	n, err := h.svc.GetNote(userID, noteID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, dto.ToNoteResponse(n))
}

// patchNote обрабатывает PATCH /api/v1/notes/{id} {text?, done?, priority?, pinned?, archived?} → 200 Note.
// Применяет только переданные поля, затем возвращает актуальную заметку
// (фронт делает оптимистичные обновления).
func (h *todoHandler) patchNote(w http.ResponseWriter, r *http.Request) {
	noteID, err := pathID(r)
	if err != nil {
		httperr.Write(w, err)
		return
	}

	var input dto.NotePatchRequest
	if err := decodeJSON(r, &input); err != nil {
		httperr.Write(w, errs.ErrInvalidJSON)
		return
	}
	if input.Text == nil && input.Done == nil && input.Priority == nil && input.Pinned == nil && input.Archived == nil {
		httperr.Write(w, errs.ErrInvalidJSON)
		return
	}

	userID := middleware.UserID(r.Context())

	if input.Text != nil {
		text, entities := parseMarkdownEntities(*input.Text)
		if err := h.svc.EditNote(userID, noteID, text, entities); err != nil {
			httperr.Write(w, err)
			return
		}
	}
	if input.Done != nil {
		var err error
		if *input.Done {
			err = h.svc.MarkDone(userID, noteID)
		} else {
			err = h.svc.MarkUndone(userID, noteID)
		}
		if err != nil {
			httperr.Write(w, err)
			return
		}
	}
	if input.Priority != nil {
		p, err := dto.ParsePriority(*input.Priority)
		if err != nil {
			httperr.Write(w, err)
			return
		}
		if err := h.svc.SetPriority(userID, noteID, p); err != nil {
			httperr.Write(w, err)
			return
		}
	}
	if input.Pinned != nil {
		var err error
		if *input.Pinned {
			err = h.svc.PinNote(userID, noteID)
		} else {
			err = h.svc.UnpinNote(userID, noteID)
		}
		if err != nil {
			httperr.Write(w, err)
			return
		}
	}
	if input.Archived != nil {
		var err error
		if *input.Archived {
			err = h.svc.ArchiveNote(userID, noteID)
		} else {
			err = h.svc.UnarchiveNote(userID, noteID)
		}
		if err != nil {
			httperr.Write(w, err)
			return
		}
	}

	n, err := h.svc.GetNote(userID, noteID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, dto.ToNoteResponse(n))
}

// deleteNote обрабатывает DELETE /api/v1/notes/{id} → 204.
func (h *todoHandler) deleteNote(w http.ResponseWriter, r *http.Request) {
	noteID, err := pathID(r)
	if err != nil {
		httperr.Write(w, err)
		return
	}

	if err := h.svc.DeleteNote(middleware.UserID(r.Context()), noteID); err != nil {
		httperr.Write(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// setReminder обрабатывает PUT /api/v1/notes/{id}/reminder {at, repeat} → 200 Note.
// at — ISO 8601 (RFC3339); одноразовое напоминание (once) должно быть в будущем.
func (h *todoHandler) setReminder(w http.ResponseWriter, r *http.Request) {
	noteID, err := pathID(r)
	if err != nil {
		httperr.Write(w, err)
		return
	}

	var input dto.ReminderRequest
	if err := decodeJSON(r, &input); err != nil {
		httperr.Write(w, errs.ErrInvalidJSON)
		return
	}

	at, err := time.Parse(time.RFC3339, input.At)
	if err != nil {
		httperr.Write(w, errs.ErrInvalidJSON)
		return
	}
	repeat, err := model.NewReminderRepeat(input.Repeat)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	// Одноразовое напоминание не может быть в прошлом (как в боте).
	if repeat == model.ReminderRepeatOnce && !at.After(time.Now().UTC()) {
		httperr.Write(w, errs.ErrReminderInPast)
		return
	}

	userID := middleware.UserID(r.Context())
	if err := h.svc.SetReminder(userID, noteID, at, repeat); err != nil {
		httperr.Write(w, err)
		return
	}

	n, err := h.svc.GetNote(userID, noteID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, dto.ToNoteResponse(n))
}

// clearReminder обрабатывает DELETE /api/v1/notes/{id}/reminder → 200 Note.
func (h *todoHandler) clearReminder(w http.ResponseWriter, r *http.Request) {
	noteID, err := pathID(r)
	if err != nil {
		httperr.Write(w, err)
		return
	}

	userID := middleware.UserID(r.Context())
	if err := h.svc.ClearReminder(userID, noteID); err != nil {
		httperr.Write(w, err)
		return
	}

	n, err := h.svc.GetNote(userID, noteID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, dto.ToNoteResponse(n))
}
