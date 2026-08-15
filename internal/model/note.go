package model

import (
	"time"

	"todo-bot-tg/internal/errors"
)

// Note — агрегат, представляющий заметку пользователя.
type Note struct {
	ID             int64
	UserID         int64
	TopicID        int64  // 0 — без топика
	FolderID       *int64 // nil — в корне топика (не в папке)
	Text           string
	Priority       Priority       // PriorityNone / Low / Medium / High
	ReminderAt     *time.Time     // nil — без напоминания
	ReminderRepeat ReminderRepeat // once / daily
	CreatedAt      time.Time
	Archived       bool
	Done           bool // заметка выполнена (галочка)
	Pinned         bool // заметка закреплена (всегда вверху списка)
}

// NewNote создаёт новую заметку с валидацией (по умолчанию без приоритета).
func NewNote(userID, topicID int64, folderID *int64, text string) (*Note, error) {
	if text == "" {
		return nil, errors.ErrEmptyText
	}
	return &Note{
		UserID:    userID,
		TopicID:   topicID,
		FolderID:  folderID,
		Text:      text,
		Priority:  PriorityNone,
		CreatedAt: time.Now(),
	}, nil
}

// SetPriority меняет приоритет заметки (валидирует диапазон).
func (n *Note) SetPriority(p Priority) error {
	if !p.valid() {
		return errors.ErrInvalidPriority
	}
	n.Priority = p
	return nil
}

// SetReminder устанавливает напоминание с валидацией типа повторения.
func (n *Note) SetReminder(at time.Time, repeat ReminderRepeat) error {
	if !repeat.valid() {
		return errors.ErrInvalidReminderRepeat
	}
	n.ReminderAt = &at
	n.ReminderRepeat = repeat
	return nil
}

// ClearReminder убирает напоминание с заметки.
func (n *Note) ClearReminder() {
	n.ReminderAt = nil
	n.ReminderRepeat = ReminderRepeatOnce
}

// Archive помечает заметку как архивную.
func (n *Note) Archive() {
	n.Archived = true
}

// Unarchive восстанавливает заметку из архива.
func (n *Note) Unarchive() {
	n.Archived = false
}

// MarkDone помечает заметку как выполненную.
func (n *Note) MarkDone() {
	n.Done = true
}

// MarkUndone снимает отметку выполнения.
func (n *Note) MarkUndone() {
	n.Done = false
}

// Pin закрепляет заметку (она всегда отображается первой в списке).
func (n *Note) Pin() {
	n.Pinned = true
}

// Unpin открепляет заметку.
func (n *Note) Unpin() {
	n.Pinned = false
}

// EditText обновляет текст заметки.
func (n *Note) EditText(text string) error {
	if text == "" {
		return errors.ErrEmptyText
	}
	n.Text = text
	return nil
}
