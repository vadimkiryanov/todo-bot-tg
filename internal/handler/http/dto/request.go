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
	TopicID int64  `json:"topic_id"`
	Text    string `json:"text"`
}

// NotePatchRequest — тело PATCH /api/v1/notes/{id}.
// Указатели отличают «поле не передано» от нулевого значения.
type NotePatchRequest struct {
	Text     *string `json:"text"`
	Done     *bool   `json:"done"`
	Priority *string `json:"priority"`
}
