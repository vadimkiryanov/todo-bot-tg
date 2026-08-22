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

// NoteEntityResponse — сущность форматирования фрагмента заметки
// (формат Telegram MessageEntity; offset/length в UTF-16 единицах).
type NoteEntityResponse struct {
	Type   string `json:"type"`
	Offset int    `json:"offset"`
	Length int    `json:"length"`
	URL    string `json:"url,omitempty"`
}

// NoteResponse — публичное представление заметки (контракт фронта).
type NoteResponse struct {
	ID        int64                `json:"id"`
	Text      string               `json:"text"`
	Entities  []NoteEntityResponse `json:"entities"`
	Priority  string               `json:"priority"`
	Done      bool                 `json:"done"`
	Pinned    bool                 `json:"pinned"`
	Archived  bool                 `json:"archived"`
	CreatedAt string               `json:"created_at"`
}
