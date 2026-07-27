package entity

import "time"

// NoteRecord — persistence-модель для заметки (только базовые типы).
type NoteRecord struct {
	ID        int64
	UserID    int64
	TopicID   int64
	Text      string
	CreatedAt time.Time
	Archived  bool
}

// TopicRecord — persistence-модель для топика.
type TopicRecord struct {
	ID     int64
	UserID int64
	Name   string
}
