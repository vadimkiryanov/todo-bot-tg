package dto

import (
	"time"

	"todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/model"
	"todo-bot-tg/internal/user"
)

// ToUserResponse конвертирует доменную модель в DTO.
// Telegram-пользователи не отдают пароль/telegram_id — только id и логин.
func ToUserResponse(u user.User) UserResponse {
	return UserResponse{
		ID:       u.ID,
		Username: u.Username,
	}
}

// ToTopicResponse конвертирует топик в DTO с количеством заметок.
func ToTopicResponse(t model.Topic, noteCount int) TopicResponse {
	return TopicResponse{
		ID:        t.ID,
		Name:      t.Name,
		NoteCount: noteCount,
	}
}

// ToNoteResponse конвертирует заметку в DTO.
func ToNoteResponse(n model.Note) NoteResponse {
	entities := make([]NoteEntityResponse, 0, len(n.Entities))
	for _, e := range n.Entities {
		entities = append(entities, NoteEntityResponse{
			Type:   e.Type,
			Offset: e.Offset,
			Length: e.Length,
			URL:    e.URL,
		})
	}
	return NoteResponse{
		ID:        n.ID,
		Text:      n.Text,
		Entities:  entities,
		Priority:  PriorityString(n.Priority),
		Done:      n.Done,
		Pinned:    n.IsPinned(),
		Archived:  n.Archived,
		CreatedAt: n.CreatedAt.Format(time.RFC3339),
	}
}

// PriorityString сериализует приоритет в строку контракта API.
func PriorityString(p model.Priority) string {
	switch p {
	case model.PriorityLow:
		return "low"
	case model.PriorityMedium:
		return "medium"
	case model.PriorityHigh:
		return "high"
	default:
		return "none"
	}
}

// ParsePriority разбирает строку приоритета из контракта API.
func ParsePriority(s string) (model.Priority, error) {
	switch s {
	case "none":
		return model.PriorityNone, nil
	case "low":
		return model.PriorityLow, nil
	case "medium":
		return model.PriorityMedium, nil
	case "high":
		return model.PriorityHigh, nil
	default:
		return model.PriorityNone, errors.ErrInvalidPriority
	}
}
