// Package dto — Request/Response модели REST API (внешний контракт, §6).
package dto

// RegisterRequest — тело POST /api/v1/auth/register.
type RegisterRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginRequest — тело POST /api/v1/auth/login.
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// TopicRequest — тело POST/PATCH /api/v1/topics.
type TopicRequest struct {
	Name string `json:"name"`
}

// NoteCreateRequest — тело POST /api/v1/notes.
type NoteCreateRequest struct {
	TopicID  int64  `json:"topic_id"`
	FolderID *int64 `json:"folder_id"` // nil — в корне топика
	Text     string `json:"text"`
}

// NotePatchRequest — тело PATCH /api/v1/notes/{id}.
// Указатели отличают «поле не передано» от нулевого значения.
type NotePatchRequest struct {
	Text     *string `json:"text"`
	Done     *bool   `json:"done"`
	Priority *string `json:"priority"`
	Pinned   *bool   `json:"pinned"`
	Archived *bool   `json:"archived"`
}

// NoteMoveRequest — тело POST /api/v1/notes/{id}/move.
// FolderID nil — переместить в корень топика.
type NoteMoveRequest struct {
	TopicID  int64  `json:"topic_id"`
	FolderID *int64 `json:"folder_id"`
}

// ReminderRequest — тело PUT /api/v1/notes/{id}/reminder.
// At — ISO 8601 (RFC3339); одноразовое напоминание должно быть в будущем.
type ReminderRequest struct {
	At     string `json:"at"`
	Repeat string `json:"repeat"` // "once" | "daily"
}

// FolderRequest — тело POST/PATCH /api/v1/folders.
type FolderRequest struct {
	TopicID        int64  `json:"topic_id"`
	ParentFolderID *int64 `json:"parent_folder_id"` // nil — папка в корне топика
	Name           string `json:"name"`
}
