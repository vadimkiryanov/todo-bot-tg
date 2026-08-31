package http

import (
	"net/http"
	"strconv"

	errs "todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/handler/http/dto"
	"todo-bot-tg/internal/httperr"
	"todo-bot-tg/internal/middleware"
	"todo-bot-tg/internal/model"
)

// listNotes обрабатывает GET /api/v1/notes?topic_id=N&folder_id=X → [Note].
// topic_id опционален: без него возвращаются заметки без топика.
// archived=true → архивные заметки пользователя (без фильтра по топику).
func (h *todoHandler) listNotes(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserID(r.Context())

	var notes []model.Note
	var err error
	if r.URL.Query().Get("archived") == "true" {
		notes, err = h.svc.ListArchived(userID)
	} else {
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
	n, err := h.svc.AddNote(middleware.UserID(r.Context()), input.TopicID, input.FolderID, text, entities, model.PriorityNone)
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
