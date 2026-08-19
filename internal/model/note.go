package model

import (
	"time"

	"todo-bot-tg/internal/errors"
)

// NoteEntity — сущность форматирования фрагмента текста заметки.
// Соответствует MessageEntity из Telegram: поля хранятся как есть,
// чтобы при отображении можно было восстановить форматирование.
type NoteEntity struct {
	Type     string `json:"type"`               // bold, italic, code, pre, text_link, ...
	Offset   int    `json:"offset"`             // смещение начала фрагмента (в UTF-16 единицах, как у Telegram)
	Length   int    `json:"length"`             // длина фрагмента (в UTF-16 единицах)
	URL      string `json:"url,omitempty"`      // text_link: адрес ссылки
	Language string `json:"language,omitempty"` // pre: язык кода
}

// Note — агрегат, представляющий заметку пользователя.
type Note struct {
	ID             int64
	UserID         int64
	TopicID        int64  // 0 — без топика
	FolderID       *int64 // nil — в корне топика (не в папке)
	Text           string
	Entities       []NoteEntity   // форматирование текста (nil — без форматирования)
	Priority       Priority       // PriorityNone / Low / Medium / High
	ReminderAt     *time.Time     // nil — без напоминания
	ReminderRepeat ReminderRepeat // once / daily
	CreatedAt      time.Time
	Archived       bool
	Done           bool       // заметка выполнена (галочка)
	Pinned         bool       // заметка закреплена (всегда вверху списка)
	PinnedUntil    *time.Time // nil — закреплена постоянно; иначе — время окончания закрепления
}

// NewNote создаёт новую заметку с валидацией (по умолчанию без приоритета).
func NewNote(userID, topicID int64, folderID *int64, text string, entities []NoteEntity) (*Note, error) {
	if text == "" {
		return nil, errors.ErrEmptyText
	}
	return &Note{
		UserID:    userID,
		TopicID:   topicID,
		FolderID:  folderID,
		Text:      text,
		Entities:  entities,
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

// Pin закрепляет заметку постоянно (она всегда отображается первой в списке).
func (n *Note) Pin() {
	n.Pinned = true
	n.PinnedUntil = nil
}

// PinUntil закрепляет заметку до указанного времени (после — открепляется сама).
func (n *Note) PinUntil(at time.Time) {
	n.Pinned = true
	n.PinnedUntil = &at
}

// Unpin открепляет заметку.
func (n *Note) Unpin() {
	n.Pinned = false
	n.PinnedUntil = nil
}

// IsPinned возвращает true, если заметка закреплена в данный момент:
// истёкшее по времени закрепление считается откреплённым даже до
// обработки воркером (PinnedUntil в прошлом).
func (n *Note) IsPinned() bool {
	return n.Pinned && (n.PinnedUntil == nil || n.PinnedUntil.After(time.Now().UTC()))
}

// EditText обновляет текст заметки и его форматирование.
func (n *Note) EditText(text string, entities []NoteEntity) error {
	if text == "" {
		return errors.ErrEmptyText
	}
	n.Text = text
	n.Entities = entities
	return nil
}
