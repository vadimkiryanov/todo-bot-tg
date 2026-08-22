package dto

// UserResponse — публичное представление пользователя {id, username}.
type UserResponse struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
}

// UserEnvelope — тело ответа auth-эндпоинтов: {user: {...}} (контракт фронта).
type UserEnvelope struct {
	User UserResponse `json:"user"`
}

// TopicResponse — публичное представление топика {id, name, note_count}.
type TopicResponse struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	NoteCount int    `json:"note_count"`
}

// NoteResponse — публичное представление заметки (контракт фронта).
type NoteResponse struct {
	ID        int64  `json:"id"`
	Text      string `json:"text"`
	Priority  string `json:"priority"`
	Done      bool   `json:"done"`
	Pinned    bool   `json:"pinned"`
	CreatedAt string `json:"created_at"`
}
