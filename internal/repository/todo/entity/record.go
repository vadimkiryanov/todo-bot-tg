package entity

import "time"

// NoteRecord — persistence-модель для заметки (только базовые типы).
type NoteRecord struct {
	ID         int64
	UserID     int64
	TopicID    int64
	FolderID   *int64
	Text       string
	Priority   int
	ReminderAt     *time.Time
	ReminderRepeat string
	CreatedAt      time.Time
	Archived   bool
	Done       bool
}

// TopicRecord — persistence-модель для топика.
type TopicRecord struct {
	ID     int64
	UserID int64
	Name   string
}

// FolderRecord — persistence-модель для папки.
type FolderRecord struct {
	ID             int64
	UserID         int64
	TopicID        int64
	ParentFolderID *int64
	Name           string
}
