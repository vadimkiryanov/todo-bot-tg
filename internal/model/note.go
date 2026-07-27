package model

import (
	"time"

	"todo-bot-tg/internal/errors"
)

// Приоритеты заметок.
const (
	PriorityNone   = 0
	PriorityLow    = 1
	PriorityMedium = 2
	PriorityHigh   = 3
)

// Note — агрегат, представляющий заметку пользователя.
type Note struct {
	ID         int64
	UserID     int64
	TopicID    int64 // 0 — без топика
	Text       string
	Priority   int        // PriorityNone / Low / Medium / High
	ReminderAt *time.Time // nil — без напоминания
	CreatedAt  time.Time
	Archived   bool
}

// PriorityEmoji возвращает эмодзи приоритета (пустая строка для None).
func (n *Note) PriorityEmoji() string {
	switch n.Priority {
	case PriorityHigh:
		return "🔥"
	case PriorityMedium:
		return "⚡"
	case PriorityLow:
		return "🌿"
	default:
		return ""
	}
}

// NewNote создаёт новую заметку с валидацией (по умолчанию без приоритета).
func NewNote(userID, topicID int64, text string) (*Note, error) {
	if text == "" {
		return nil, errors.ErrEmptyText
	}
	return &Note{
		UserID:    userID,
		TopicID:   topicID,
		Text:      text,
		Priority:  PriorityNone,
		CreatedAt: time.Now(),
	}, nil
}

// Archive помечает заметку как архивную.
func (n *Note) Archive() {
	n.Archived = true
}

// Unarchive восстанавливает заметку из архива.
func (n *Note) Unarchive() {
	n.Archived = false
}

// EditText обновляет текст заметки.
func (n *Note) EditText(text string) error {
	if text == "" {
		return errors.ErrEmptyText
	}
	n.Text = text
	return nil
}
