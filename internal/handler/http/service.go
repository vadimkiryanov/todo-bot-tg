package http

import (
	"todo-bot-tg/internal/model"
)

// TodoService — интерфейс сервиса топиков и заметок (потребитель — HTTP-handler).
// Сужен до методов, которые использует REST API веб-фронта.
type TodoService interface {
	ListTopics(userID int64) ([]model.Topic, error)
	CreateTopic(userID int64, name string) (model.Topic, error)
	RenameTopic(userID, topicID int64, name string) (model.Topic, error)
	DeleteTopic(userID, topicID int64) error

	ListNotes(userID, topicID int64, folderID *int64) ([]model.Note, error)
	AddNote(userID, topicID int64, folderID *int64, text string, entities []model.NoteEntity, priority model.Priority) (model.Note, error)
	GetNote(userID, noteID int64) (model.Note, error)
	EditNote(userID, noteID int64, text string, entities []model.NoteEntity) error
	MarkDone(userID, noteID int64) error
	MarkUndone(userID, noteID int64) error
	SetPriority(userID, noteID int64, priority model.Priority) error
	PinNote(userID, noteID int64) error
	UnpinNote(userID, noteID int64) error
	ArchiveNote(userID, noteID int64) error
	UnarchiveNote(userID, noteID int64) error
	ListArchived(userID int64) ([]model.Note, error)
	DeleteNote(userID, noteID int64) error

	CountNotes(userID, topicID int64, folderID *int64) (int, error)
}

// todoHandler — обработчики эндпоинтов топиков и заметок (§6).
type todoHandler struct {
	svc TodoService
}

func newTodoHandler(svc TodoService) *todoHandler {
	return &todoHandler{svc: svc}
}
