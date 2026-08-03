package todo

import (
	"sync"
	"time"

	"todo-bot-tg/internal/model"
)

// NoteRepository — интерфейс хранилища заметок (определён потребителем — сервисом).
type NoteRepository interface {
	CreateNote(note model.Note) (model.Note, error)
	ListNotes(userID, topicID int64, folderID *int64) ([]model.Note, error)
	GetNote(userID, noteID int64) (model.Note, error)
	GetNoteByID(noteID int64) (model.Note, error)
	UpdateNote(note model.Note) error
	DeleteNote(userID, noteID int64) error
	CountNotes(userID, topicID int64, folderID *int64) (int, error)
	ListArchived(userID int64) ([]model.Note, error)
	CountArchived(userID int64) (int, error)
	HasAnyData(userID int64) bool
	GetPendingReminders() ([]model.Note, error)
}

// TopicRepository — интерфейс хранилища топиков (определён потребителем — сервисом).
type TopicRepository interface {
	CreateTopic(userID int64, name string) (model.Topic, error)
	ListTopics(userID int64) ([]model.Topic, error)
	GetTopic(userID, topicID int64) (model.Topic, error)
	DeleteTopic(userID, topicID int64) error
}

// FolderRepository — интерфейс хранилища папок (определён потребителем — сервисом).
type FolderRepository interface {
	CreateFolder(folder model.Folder) (model.Folder, error)
	ListFolders(userID, topicID int64, parentFolderID *int64) ([]model.Folder, error)
	GetFolder(userID, folderID int64) (model.Folder, error)
	GetFolderChain(folderID int64) ([]model.Folder, error) // путь от корня до папки
}

// Service — сервисный слой, оркеструет бизнес-операции.
type Service struct {
	mu         sync.Mutex
	noteRepo   NoteRepository
	topicRepo  TopicRepository
	folderRepo FolderRepository
}

// NewService создаёт новый сервис.
func NewService(noteRepo NoteRepository, topicRepo TopicRepository, folderRepo FolderRepository) *Service {
	return &Service{
		noteRepo:   noteRepo,
		topicRepo:  topicRepo,
		folderRepo: folderRepo,
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

// AddNote добавляет новую заметку с указанным приоритетом.
func (s *Service) AddNote(userID, topicID int64, folderID *int64, text string, priority int) (model.Note, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	note, err := model.NewNote(userID, topicID, folderID, text)
	if err != nil {
		return model.Note{}, err
	}

	note.Priority = priority
	return s.noteRepo.CreateNote(*note)
}

// ListNotes возвращает список заметок пользователя (с фильтрацией по топику и папке).
func (s *Service) ListNotes(userID, topicID int64, folderID *int64) ([]model.Note, error) {
	return s.noteRepo.ListNotes(userID, topicID, folderID)
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

// SetPriority меняет приоритет заметки.
func (s *Service) SetPriority(userID, noteID int64, priority int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.Priority = priority
	return s.noteRepo.UpdateNote(note)
}

// SetReminder устанавливает напоминание на заметку.
func (s *Service) SetReminder(userID, noteID int64, at time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.ReminderAt = &at
	return s.noteRepo.UpdateNote(note)
}

// ClearReminder убирает напоминание с заметки.
func (s *Service) ClearReminder(userID, noteID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.ReminderAt = nil
	return s.noteRepo.UpdateNote(note)
}

// GetNoteByID возвращает заметку по ID (без проверки userID).
func (s *Service) GetNoteByID(noteID int64) (model.Note, error) {
	return s.noteRepo.GetNoteByID(noteID)
}

// ProcessPendingReminders возвращает заметки с просроченными напоминаниями и сбрасывает их.
func (s *Service) ProcessPendingReminders() ([]model.Note, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	notes, err := s.noteRepo.GetPendingReminders()
	if err != nil {
		return nil, err
	}

	for i := range notes {
		notes[i].ReminderAt = nil
		_ = s.noteRepo.UpdateNote(notes[i])
	}

	return notes, nil
}

// CountNotes возвращает количество активных заметок.
func (s *Service) CountNotes(userID, topicID int64, folderID *int64) (int, error) {
	return s.noteRepo.CountNotes(userID, topicID, folderID)
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

// --- Folders ---

// CreateFolder создаёт новую папку.
func (s *Service) CreateFolder(userID, topicID int64, parentFolderID *int64, name string) (model.Folder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	folder, err := model.NewFolder(userID, topicID, parentFolderID, name)
	if err != nil {
		return model.Folder{}, err
	}

	return s.folderRepo.CreateFolder(*folder)
}

// ListFolders возвращает список папок в указанном месте.
func (s *Service) ListFolders(userID, topicID int64, parentFolderID *int64) ([]model.Folder, error) {
	return s.folderRepo.ListFolders(userID, topicID, parentFolderID)
}

// GetFolder возвращает папку по ID.
func (s *Service) GetFolder(userID, folderID int64) (model.Folder, error) {
	return s.folderRepo.GetFolder(userID, folderID)
}

// GetFolderChain возвращает цепочку папок от корня до указанной.
func (s *Service) GetFolderChain(folderID int64) ([]model.Folder, error) {
	return s.folderRepo.GetFolderChain(folderID)
}
