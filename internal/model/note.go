package model

import (
	"time"

	"todo-bot-tg/internal/errors"
)

// Note — агрегат, представляющий заметку пользователя.
type Note struct {
	ID        int64
	UserID    int64
	TopicID   int64 // 0 — без топика
	Text      string
	CreatedAt time.Time
	Archived  bool
}

// NewNote создаёт новую заметку с валидацией.
func NewNote(userID, topicID int64, text string) (*Note, error) {
	if text == "" {
		return nil, errors.ErrEmptyText
	}
	return &Note{
		UserID:    userID,
		TopicID:   topicID,
		Text:      text,
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
