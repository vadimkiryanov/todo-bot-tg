package todo

import (
	"sync"

	"todo-bot-tg/internal/model"
)

// NoteRepository — интерфейс хранилища заметок (определён потребителем — сервисом).
type NoteRepository interface {
	CreateNote(note model.Note) (model.Note, error)
	ListNotes(userID, topicID int64) ([]model.Note, error)
	GetNote(userID, noteID int64) (model.Note, error)
	UpdateNote(note model.Note) error
	DeleteNote(userID, noteID int64) error
	CountNotes(userID, topicID int64) (int, error)
	ListArchived(userID int64) ([]model.Note, error)
	CountArchived(userID int64) (int, error)
	HasAnyData(userID int64) bool
}

// TopicRepository — интерфейс хранилища топиков (определён потребителем — сервисом).
type TopicRepository interface {
	CreateTopic(userID int64, name string) (model.Topic, error)
	ListTopics(userID int64) ([]model.Topic, error)
	GetTopic(userID, topicID int64) (model.Topic, error)
	DeleteTopic(userID, topicID int64) error
}

// Service — сервисный слой, оркеструет бизнес-операции.
type Service struct {
	mu        sync.Mutex
	noteRepo  NoteRepository
	topicRepo TopicRepository
}

// NewService создаёт новый сервис.
func NewService(noteRepo NoteRepository, topicRepo TopicRepository) *Service {
	return &Service{
		noteRepo:  noteRepo,
		topicRepo: topicRepo,
	}
}

// --- Topics ---

// CreateTopic создаёт новый топик.
func (s *Service) CreateTopic(userID int64, name string) (model.Topic, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	topic, err := model.NewTopic(userID, name)
	if err != nil {
		return model.Topic{}, err
	}

	return s.topicRepo.CreateTopic(topic.UserID, topic.Name)
}

// ListTopics возвращает все топики пользователя.
func (s *Service) ListTopics(userID int64) ([]model.Topic, error) {
	return s.topicRepo.ListTopics(userID)
}

// GetTopic возвращает топик по ID.
func (s *Service) GetTopic(userID, topicID int64) (model.Topic, error) {
	return s.topicRepo.GetTopic(userID, topicID)
}

// DeleteTopic удаляет топик вместе с заметками.
func (s *Service) DeleteTopic(userID, topicID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.topicRepo.DeleteTopic(userID, topicID)
}

// --- Notes ---

// AddNote добавляет новую заметку.
func (s *Service) AddNote(userID, topicID int64, text string) (model.Note, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	note, err := model.NewNote(userID, topicID, text)
	if err != nil {
		return model.Note{}, err
	}

	return s.noteRepo.CreateNote(*note)
}

// ListNotes возвращает список заметок пользователя (с фильтрацией по топику).
func (s *Service) ListNotes(userID, topicID int64) ([]model.Note, error) {
	return s.noteRepo.ListNotes(userID, topicID)
}

// GetNote возвращает заметку по ID.
func (s *Service) GetNote(userID, noteID int64) (model.Note, error) {
	return s.noteRepo.GetNote(userID, noteID)
}

// EditNote обновляет текст заметки.
func (s *Service) EditNote(userID, noteID int64, text string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	if err := note.EditText(text); err != nil {
		return err
	}

	return s.noteRepo.UpdateNote(note)
}

// DeleteNote удаляет заметку.
func (s *Service) DeleteNote(userID, noteID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.noteRepo.DeleteNote(userID, noteID)
}

// ArchiveNote архивирует заметку.
func (s *Service) ArchiveNote(userID, noteID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.Archive()
	return s.noteRepo.UpdateNote(note)
}

// UnarchiveNote разархивирует заметку.
func (s *Service) UnarchiveNote(userID, noteID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.Unarchive()
	return s.noteRepo.UpdateNote(note)
}

// CountNotes возвращает количество активных заметок.
func (s *Service) CountNotes(userID, topicID int64) (int, error) {
	return s.noteRepo.CountNotes(userID, topicID)
}

// ListArchived возвращает список архивных заметок.
func (s *Service) ListArchived(userID int64) ([]model.Note, error) {
	return s.noteRepo.ListArchived(userID)
}

// CountArchived возвращает количество архивных заметок.
func (s *Service) CountArchived(userID int64) (int, error) {
	return s.noteRepo.CountArchived(userID)
}

// HasAnyData возвращает true, если у пользователя есть данные.
func (s *Service) HasAnyData(userID int64) bool {
	return s.noteRepo.HasAnyData(userID)
}

// SeedDefaults создаёт дефолтные топики и заметки новому пользователю.
func (s *Service) SeedDefaults(userID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.noteRepo.HasAnyData(userID) {
		return nil
	}

	personal, err := s.topicRepo.CreateTopic(userID, "🏠 Личное")
	if err != nil {
		return err
	}

	work, err := s.topicRepo.CreateTopic(userID, "💼 Работа")
	if err != nil {
		return err
	}

	_, _ = s.noteRepo.CreateNote(model.Note{UserID: userID, TopicID: personal.ID, Text: "Купить продукты: хлеб, молоко, яйца"})
	_, _ = s.noteRepo.CreateNote(model.Note{UserID: userID, TopicID: personal.ID, Text: "Записаться к стоматологу"})
	_, _ = s.noteRepo.CreateNote(model.Note{UserID: userID, TopicID: personal.ID, Text: "Позвонить родителям"})
	_, _ = s.noteRepo.CreateNote(model.Note{UserID: userID, TopicID: work.ID, Text: "Подготовить отчёт за квартал"})
	_, _ = s.noteRepo.CreateNote(model.Note{UserID: userID, TopicID: work.ID, Text: "Созвон с командой в 15:00"})

	return nil
}
