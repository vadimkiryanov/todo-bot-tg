package model

import "todo-bot-tg/internal/errors"

// Topic — агрегат, представляющий топик (категорию) заметок пользователя.
type Topic struct {
	ID     int64
	UserID int64
	Name   string
}

// NewTopic создаёт новый топик с валидацией.
func NewTopic(userID int64, name string) (*Topic, error) {
	if name == "" {
		return nil, errors.ErrEmptyName
	}
	return &Topic{
		UserID: userID,
		Name:   name,
	}, nil
}
