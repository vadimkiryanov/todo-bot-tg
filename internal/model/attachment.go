package model

import (
	"time"

	"todo-bot-tg/internal/errors"
)

// AttachmentType — тип вложения (тип медиа в Telegram).
type AttachmentType string

const (
	AttachmentPhoto     AttachmentType = "photo"
	AttachmentDocument  AttachmentType = "document"
	AttachmentAudio     AttachmentType = "audio"
	AttachmentVideo     AttachmentType = "video"
	AttachmentVoice     AttachmentType = "voice"
	AttachmentVideoNote AttachmentType = "video_note"
	AttachmentAnimation AttachmentType = "animation"
	AttachmentSticker   AttachmentType = "sticker"
)

var validAttachmentTypes = map[AttachmentType]bool{
	AttachmentPhoto:     true,
	AttachmentDocument:  true,
	AttachmentAudio:     true,
	AttachmentVideo:     true,
	AttachmentVoice:     true,
	AttachmentVideoNote: true,
	AttachmentAnimation: true,
	AttachmentSticker:   true,
}

// NewAttachmentType валидирует и создаёт тип вложения.
func NewAttachmentType(v string) (AttachmentType, error) {
	t := AttachmentType(v)
	if !validAttachmentTypes[t] {
		return "", errors.ErrInvalidAttachmentType
	}
	return t, nil
}

// Attachment — вложение заметки (сущность с ID).
type Attachment struct {
	ID        int64
	NoteID    int64
	UserID    int64
	Type      AttachmentType
	FileID    string // file_id в Telegram
	FilePath  string // относительный путь в файловом хранилище
	FileName  string // оригинальное имя файла
	MimeType  string
	FileSize  int64
	CreatedAt time.Time
}

// NewAttachment создаёт вложение с валидацией обязательных полей.
func NewAttachment(userID, noteID int64, attType AttachmentType, fileID, filePath, fileName, mimeType string, fileSize int64) (*Attachment, error) {
	if fileID == "" {
		return nil, errors.ErrEmptyFileID
	}
	if filePath == "" {
		return nil, errors.ErrEmptyFilePath
	}
	return &Attachment{
		NoteID:    noteID,
		UserID:    userID,
		Type:      attType,
		FileID:    fileID,
		FilePath:  filePath,
		FileName:  fileName,
		MimeType:  mimeType,
		FileSize:  fileSize,
		CreatedAt: time.Now(),
	}, nil
}
