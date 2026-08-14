package todo

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"todo-bot-tg/internal/errors"
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
	CountDoneNotes(userID, topicID int64, folderID *int64) (int, error)
	ListArchived(userID int64) ([]model.Note, error)
	CountArchived(userID int64) (int, error)
	HasAnyData(userID int64) bool
	GetPendingReminders() ([]model.Note, error)
	MoveNote(userID, noteID int64, topicID int64, folderID *int64) error
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
	CountFolders(userID, topicID int64, parentFolderID *int64) (int, error)
}

// AttachmentRepository — интерфейс хранилища вложений (определён потребителем — сервисом).
type AttachmentRepository interface {
	CreateAttachment(att model.Attachment) (model.Attachment, error)
	ListAttachments(noteID int64) ([]model.Attachment, error)
	GetAttachment(attID int64) (model.Attachment, error)
	DeleteAttachment(attID int64) error
}

// FileStore — порт файлового хранилища (внешняя инфраструктура, ACL).
type FileStore interface {
	Save(userID, noteID int64, ext string, data []byte) (string, error)
	Delete(relPath string) error
	AbsPath(relPath string) string
}

// Service — сервисный слой, оркеструет бизнес-операции.
type Service struct {
	mu         sync.Mutex
	noteRepo   NoteRepository
	topicRepo  TopicRepository
	folderRepo FolderRepository
	attRepo    AttachmentRepository
	fileStore  FileStore
}

// NewService создаёт новый сервис.
func NewService(noteRepo NoteRepository, topicRepo TopicRepository, folderRepo FolderRepository, attRepo AttachmentRepository, fileStore FileStore) *Service {
	return &Service{
		noteRepo:   noteRepo,
		topicRepo:  topicRepo,
		folderRepo: folderRepo,
		attRepo:    attRepo,
		fileStore:  fileStore,
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

// DeleteTopic удаляет топик вместе с заметками и файлами вложений.
func (s *Service) DeleteTopic(userID, topicID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	notes, err := s.noteRepo.ListNotes(userID, topicID, nil)
	if err != nil {
		return err
	}
	for _, n := range notes {
		s.deleteNoteFiles(n.ID)
	}
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
// Активные заметки сортируются по приоритету: High > Medium > None > Low.
// Выполненные заметки идут после всех активных.
func (s *Service) ListNotes(userID, topicID int64, folderID *int64) ([]model.Note, error) {
	notes, err := s.noteRepo.ListNotes(userID, topicID, folderID)
	if err != nil {
		return nil, err
	}

	sort.Slice(notes, func(i, j int) bool {
		// Выполненные — в конец
		if notes[i].Done != notes[j].Done {
			return !notes[i].Done
		}
		// Внутри группы — по приоритету
		return prioritySortKey(notes[i].Priority) < prioritySortKey(notes[j].Priority)
	})

	return notes, nil
}

// prioritySortKey возвращает ключ сортировки для приоритета.
// Порядок: High(0) < Medium(1) < None(2) < Low(3).
func prioritySortKey(priority int) int {
	switch priority {
	case model.PriorityHigh:
		return 0
	case model.PriorityMedium:
		return 1
	case model.PriorityNone:
		return 2
	case model.PriorityLow:
		return 3
	default:
		return 2 // неизвестный приоритет — как None
	}
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

// DeleteNote удаляет заметку вместе с файлами вложений.
func (s *Service) DeleteNote(userID, noteID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := s.noteRepo.GetNote(userID, noteID); err != nil {
		return err
	}
	s.deleteNoteFiles(noteID)
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

// MarkDone помечает заметку как выполненную.
func (s *Service) MarkDone(userID, noteID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.MarkDone()
	return s.noteRepo.UpdateNote(note)
}

// MarkUndone снимает отметку выполнения с заметки.
func (s *Service) MarkUndone(userID, noteID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.MarkUndone()
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
func (s *Service) SetReminder(userID, noteID int64, at time.Time, repeat model.ReminderRepeat) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.ReminderAt = &at
	note.ReminderRepeat = repeat
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
	note.ReminderRepeat = model.ReminderRepeatOnce
	return s.noteRepo.UpdateNote(note)
}

// GetNoteByID возвращает заметку по ID (без проверки userID).
func (s *Service) GetNoteByID(noteID int64) (model.Note, error) {
	return s.noteRepo.GetNoteByID(noteID)
}

// ProcessPendingReminders возвращает заметки с просроченными напоминаниями.
// Для одноразовых — сбрасывает ReminderAt. Для ежедневных — сдвигает на 24 часа.
func (s *Service) ProcessPendingReminders() ([]model.Note, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	notes, err := s.noteRepo.GetPendingReminders()
	if err != nil {
		return nil, err
	}

	for i := range notes {
		if notes[i].ReminderRepeat == model.ReminderRepeatDaily {
			// Сдвигаем на 24 часа вперёд
			next := notes[i].ReminderAt.Add(24 * time.Hour)
			notes[i].ReminderAt = &next
		} else {
			notes[i].ReminderAt = nil
			notes[i].ReminderRepeat = model.ReminderRepeatOnce
		}
		_ = s.noteRepo.UpdateNote(notes[i])
	}

	return notes, nil
}

// ListTimers возвращает все заметки пользователя с установленным таймером
// (напоминанием), независимо от топика и папки. Сортировка — по времени таймера.
func (s *Service) ListTimers(userID int64) ([]model.Note, error) {
	notes, err := s.noteRepo.ListNotes(userID, 0, nil)
	if err != nil {
		return nil, err
	}

	var timers []model.Note
	for _, n := range notes {
		if n.ReminderAt != nil {
			timers = append(timers, n)
		}
	}

	sort.Slice(timers, func(i, j int) bool {
		return timers[i].ReminderAt.Before(*timers[j].ReminderAt)
	})

	return timers, nil
}

// CountNotes возвращает количество активных заметок.
func (s *Service) CountNotes(userID, topicID int64, folderID *int64) (int, error) {
	return s.noteRepo.CountNotes(userID, topicID, folderID)
}

// CountDoneNotes возвращает количество выполненных заметок в топике.
func (s *Service) CountDoneNotes(userID, topicID int64, folderID *int64) (int, error) {
	return s.noteRepo.CountDoneNotes(userID, topicID, folderID)
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

// CountFolders возвращает количество папок в указанном месте.
func (s *Service) CountFolders(userID, topicID int64, parentFolderID *int64) (int, error) {
	return s.folderRepo.CountFolders(userID, topicID, parentFolderID)
}

// MoveNote перемещает заметку в другой топик и/или папку.
func (s *Service) MoveNote(userID, noteID int64, topicID int64, folderID *int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.noteRepo.MoveNote(userID, noteID, topicID, folderID)
}

// --- Attachments ---

// AddAttachment сохраняет файл на диск и создаёт запись вложения для заметки.
// Файл сохраняется только после проверки, что заметка принадлежит пользователю.
func (s *Service) AddAttachment(userID, noteID int64, attType model.AttachmentType, fileID, fileName, mimeType string, fileSize int64, data []byte) (model.Attachment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := s.noteRepo.GetNote(userID, noteID); err != nil {
		return model.Attachment{}, err
	}
	if _, err := model.NewAttachmentType(string(attType)); err != nil {
		return model.Attachment{}, err
	}
	if len(data) == 0 {
		return model.Attachment{}, errors.ErrEmptyFile
	}

	// Уникализируем отображаемое имя: если файл с таким именем уже есть у заметки,
	// добавляем порядковый постфикс — "фото.jpg", "фото (2).jpg", "фото (3).jpg"…
	used := map[string]bool{}
	if atts, err := s.attRepo.ListAttachments(noteID); err == nil {
		for _, a := range atts {
			used[a.FileName] = true
		}
	}
	fileName = uniqueFileName(fileName, used)

	rel, err := s.fileStore.Save(userID, noteID, extFromFileName(fileName), data)
	if err != nil {
		return model.Attachment{}, err
	}

	att, err := model.NewAttachment(userID, noteID, attType, fileID, rel, fileName, mimeType, fileSize)
	if err != nil {
		_ = s.fileStore.Delete(rel)
		return model.Attachment{}, err
	}

	created, err := s.attRepo.CreateAttachment(*att)
	if err != nil {
		_ = s.fileStore.Delete(rel) // запись не создана — убираем файл-сироту
		return model.Attachment{}, err
	}
	return created, nil
}

// ListAttachments возвращает вложения заметки (проверяя её владельца).
func (s *Service) ListAttachments(userID, noteID int64) ([]model.Attachment, error) {
	if _, err := s.noteRepo.GetNote(userID, noteID); err != nil {
		return nil, err
	}
	return s.attRepo.ListAttachments(noteID)
}

// GetAttachment возвращает вложение, проверяя его владельца.
func (s *Service) GetAttachment(userID, attID int64) (model.Attachment, error) {
	att, err := s.attRepo.GetAttachment(attID)
	if err != nil {
		return model.Attachment{}, err
	}
	if att.UserID != userID {
		return model.Attachment{}, errors.ErrAttachmentNotFound
	}
	return att, nil
}

// DeleteAttachment удаляет вложение: файл с диска и запись.
func (s *Service) DeleteAttachment(userID, attID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	att, err := s.attRepo.GetAttachment(attID)
	if err != nil {
		return err
	}
	if att.UserID != userID {
		return errors.ErrAttachmentNotFound
	}
	_ = s.fileStore.Delete(att.FilePath)
	return s.attRepo.DeleteAttachment(attID)
}

// deleteNoteFiles удаляет файлы всех вложений заметки (вызывается под mutex).
func (s *Service) deleteNoteFiles(noteID int64) {
	atts, err := s.attRepo.ListAttachments(noteID)
	if err != nil {
		return
	}
	for _, a := range atts {
		_ = s.fileStore.Delete(a.FilePath)
	}
}

// extFromFileName извлекает расширение файла (с точкой) или "" если его нет.
func extFromFileName(name string) string {
	return filepath.Ext(name)
}

// uniqueFileName возвращает имя, не встречающееся в used: к занятому имени
// добавляется порядковый постфикс перед расширением — "файл (2).txt", "файл (3).txt".
func uniqueFileName(name string, used map[string]bool) string {
	if !used[name] {
		return name
	}
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	for i := 2; ; i++ {
		candidate := fmt.Sprintf("%s (%d)%s", base, i, ext)
		if !used[candidate] {
			return candidate
		}
	}
}
