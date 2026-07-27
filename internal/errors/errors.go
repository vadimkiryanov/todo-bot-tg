package errors

import "errors"

// Общие
var (
	ErrNotFound       = errors.New("не найдено")
	ErrNotEnoughParts = errors.New("недостаточно")
	ErrEmptyText      = errors.New("текст заметки не может быть пустым")
	ErrEmptyName      = errors.New("название топика не может быть пустым")
)

// Topic
var (
	ErrTopicAlreadyExists = errors.New("топик с таким названием уже существует")
	ErrTopicNotFound      = errors.New("топик не найден")
)

// Note
var (
	ErrNoteNotFound = errors.New("заметка не найдена")
)
