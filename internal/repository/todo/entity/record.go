package entity

import "time"

// NoteRecord — persistence-модель для заметки (только базовые типы).
// db-теги используются pgx для маппинга строк в структуру.
type NoteRecord struct {
	ID             int64      `db:"id"`
	UserID         int64      `db:"user_id"`
	TopicID        int64      `db:"topic_id"`
	FolderID       *int64     `db:"folder_id"`
	Text           string     `db:"text"`
	Priority       int        `db:"priority"`
	ReminderAt     *time.Time `db:"reminder_at"`
	ReminderRepeat string     `db:"reminder_repeat"`
	CreatedAt      time.Time  `db:"created_at"`
	Archived       bool       `db:"archived"`
	Done           bool       `db:"done"`
	Pinned         bool       `db:"pinned"`
}

// TopicRecord — persistence-модель для топика.
type TopicRecord struct {
	ID     int64  `db:"id"`
	UserID int64  `db:"user_id"`
	Name   string `db:"name"`
}

// FolderRecord — persistence-модель для папки.
type FolderRecord struct {
	ID             int64  `db:"id"`
	UserID         int64  `db:"user_id"`
	TopicID        int64  `db:"topic_id"`
	ParentFolderID *int64 `db:"parent_folder_id"`
	Name           string `db:"name"`
}

// AttachmentRecord — persistence-модель для вложения (только базовые типы).
type AttachmentRecord struct {
	ID        int64     `db:"id"`
	NoteID    int64     `db:"note_id"`
	UserID    int64     `db:"user_id"`
	Type      string    `db:"type"` // строкой, не AttachmentType
	FileID    string    `db:"file_id"`
	FilePath  string    `db:"file_path"`
	FileName  string    `db:"file_name"`
	MimeType  string    `db:"mime_type"`
	FileSize  int64     `db:"file_size"`
	CreatedAt time.Time `db:"created_at"`
}
