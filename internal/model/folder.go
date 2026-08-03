package model

import "todo-bot-tg/internal/errors"

// Folder — агрегат, представляющий папку внутри топика.
// Может быть вложенной: ParentFolderID != nil означает подпапку.
type Folder struct {
	ID             int64
	UserID         int64
	TopicID        int64  // топик, которому принадлежит папка
	ParentFolderID *int64 // nil — папка в корне топика
	Name           string
}

// NewFolder создаёт новую папку с валидацией.
func NewFolder(userID, topicID int64, parentFolderID *int64, name string) (*Folder, error) {
	if name == "" {
		return nil, errors.ErrEmptyFolderName
	}
	return &Folder{
		UserID:         userID,
		TopicID:        topicID,
		ParentFolderID: parentFolderID,
		Name:           name,
	}, nil
}
