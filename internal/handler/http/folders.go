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

// listFolders обрабатывает GET /api/v1/folders?topic_id=N&parent_id=X → [Folder].
// parent_id опционален: без него — корневые папки топика.
// all=true — все папки топика (все уровни вложенности, для дерева/перемещения).
func (h *todoHandler) listFolders(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserID(r.Context())
	q := r.URL.Query()

	topicID, err := strconv.ParseInt(q.Get("topic_id"), 10, 64)
	if err != nil || topicID <= 0 {
		httperr.Write(w, errs.ErrInvalidJSON)
		return
	}

	var folders []model.Folder
	if q.Get("all") == "true" {
		folders, err = h.svc.ListAllFolders(userID, topicID)
	} else {
		var parentID *int64
		if p := q.Get("parent_id"); p != "" {
			id, parseErr := strconv.ParseInt(p, 10, 64)
			if parseErr != nil || id <= 0 {
				httperr.Write(w, errs.ErrInvalidJSON)
				return
			}
			parentID = &id
		}
		folders, err = h.svc.ListFolders(userID, topicID, parentID)
	}
	if err != nil {
		httperr.Write(w, err)
		return
	}

	resp := make([]dto.FolderResponse, 0, len(folders))
	for _, f := range folders {
		resp = append(resp, dto.ToFolderResponse(f))
	}
	writeJSON(w, http.StatusOK, resp)
}

// createFolder обрабатывает POST /api/v1/folders {topic_id, parent_folder_id?, name} → 201 Folder.
func (h *todoHandler) createFolder(w http.ResponseWriter, r *http.Request) {
	var input dto.FolderRequest
	if err := decodeJSON(r, &input); err != nil {
		httperr.Write(w, errs.ErrInvalidJSON)
		return
	}
	if input.Name == "" {
		httperr.Write(w, errs.ErrEmptyFolderName)
		return
	}
	if input.TopicID <= 0 {
		httperr.Write(w, errs.ErrInvalidJSON)
		return
	}

	f, err := h.svc.CreateFolder(middleware.UserID(r.Context()), input.TopicID, input.ParentFolderID, input.Name)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, dto.ToFolderResponse(f))
}

// renameFolder обрабатывает PATCH /api/v1/folders/{id} {name} → 200 Folder.
func (h *todoHandler) renameFolder(w http.ResponseWriter, r *http.Request) {
	folderID, err := pathID(r)
	if err != nil {
		httperr.Write(w, err)
		return
	}

	var input dto.FolderRequest
	if err := decodeJSON(r, &input); err != nil {
		httperr.Write(w, errs.ErrInvalidJSON)
		return
	}
	if input.Name == "" {
		httperr.Write(w, errs.ErrEmptyFolderName)
		return
	}

	f, err := h.svc.RenameFolder(middleware.UserID(r.Context()), folderID, input.Name)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, dto.ToFolderResponse(f))
}

// deleteFolder обрабатывает DELETE /api/v1/folders/{id} → 204.
// Каскад: удаляются подпапки и заметки внутри них.
func (h *todoHandler) deleteFolder(w http.ResponseWriter, r *http.Request) {
	folderID, err := pathID(r)
	if err != nil {
		httperr.Write(w, err)
		return
	}

	if err := h.svc.DeleteFolder(middleware.UserID(r.Context()), folderID); err != nil {
		httperr.Write(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
