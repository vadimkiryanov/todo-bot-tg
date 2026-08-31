package todo

import (
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"
	"sort"
	"strings"
	"time"

	errs "todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/model"
)

// NoteRepository — интерфейс хранилища заметок (определён потребителем — сервисом).
type NoteRepository interface {
	CreateNote(note model.Note) (model.Note, error)
	ListNotes(userID, topicID int64, folderID *int64) ([]model.Note, error)
	GetNote(userID, noteID int64) (model.Note, error)
	UpdateNote(note model.Note) error
	DeleteNote(userID, noteID int64) error
	CountNotes(userID, topicID int64, folderID *int64) (int, error)
	CountDoneNotes(userID, topicID int64, folderID *int64) (int, error)
	ListArchived(userID int64) ([]model.Note, error)
	CountArchived(userID int64) (int, error)
	HasAnyData(userID int64) bool
	GetPendingReminders() ([]model.Note, error)
	GetExpiredPins() ([]model.Note, error)
	MoveNote(userID, noteID int64, topicID int64, folderID *int64) error
}

// TopicRepository — интерфейс хранилища топиков (определён потребителем — сервисом).
type TopicRepository interface {
	CreateTopic(userID int64, name string) (model.Topic, error)
	ListTopics(userID int64) ([]model.Topic, error)
	GetTopic(userID, topicID int64) (model.Topic, error)
	UpdateTopic(userID, topicID int64, name string) (model.Topic, error)
	DeleteTopic(userID, topicID int64) error
}

// FolderRepository — интерфейс хранилища папок (определён потребителем — сервисом).
type FolderRepository interface {
	CreateFolder(folder model.Folder) (model.Folder, error)
	ListFolders(userID, topicID int64, parentFolderID *int64) ([]model.Folder, error)
	ListAllFolders(userID, topicID int64) ([]model.Folder, error) // все уровни вложенности
	GetFolder(userID, folderID int64) (model.Folder, error)
	GetFolderChain(folderID int64) ([]model.Folder, error) // путь от корня до папки
	CountFolders(userID, topicID int64, parentFolderID *int64) (int, error)
	RenameFolder(userID, folderID int64, name string) (model.Folder, error)
	DeleteFolder(userID, folderID int64) error // каскад: подпапки и заметки
}

// AttachmentRepository — интерфейс хранилища вложений (определён потребителем — сервисом).
type AttachmentRepository interface {
	CreateAttachment(att model.Attachment) (model.Attachment, error)
	ListAttachments(noteID int64) ([]model.Attachment, error)
	GetAttachment(attID int64) (model.Attachment, error)
	DeleteAttachment(attID int64) error
}

// SettingsRepository — интерфейс хранилища настроек пользователя (определён потребителем — сервисом).
type SettingsRepository interface {
	GetSettings(userID int64) (model.UserSettings, error)
	SaveSettings(settings model.UserSettings) error
}

// FileStore — порт файлового хранилища (внешняя инфраструктура, ACL).
type FileStore interface {
	Save(userID, noteID int64, ext string, data []byte) (string, error)
	Delete(relPath string) error
	AbsPath(relPath string) string
}

// Service — сервисный слой, оркеструет бизнес-операции.
type Service struct {
	locks        *userLocks // сериализация операций одного пользователя
	noteRepo     NoteRepository
	topicRepo    TopicRepository
	folderRepo   FolderRepository
	attRepo      AttachmentRepository
	settingsRepo SettingsRepository
	fileStore    FileStore
}

// NewService создаёт новый сервис.
func NewService(noteRepo NoteRepository, topicRepo TopicRepository, folderRepo FolderRepository, attRepo AttachmentRepository, settingsRepo SettingsRepository, fileStore FileStore) *Service {
	return &Service{
		locks:        newUserLocks(),
		noteRepo:     noteRepo,
		topicRepo:    topicRepo,
		folderRepo:   folderRepo,
		attRepo:      attRepo,
		settingsRepo: settingsRepo,
		fileStore:    fileStore,
	}
}

// --- Topics ---

// CreateTopic создаёт новый топик.
func (s *Service) CreateTopic(userID int64, name string) (model.Topic, error) {
	unlock := s.locks.Lock(userID)
	defer unlock()

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

// RenameTopic переименовывает топик.
func (s *Service) RenameTopic(userID, topicID int64, name string) (model.Topic, error) {
	unlock := s.locks.Lock(userID)
	defer unlock()

	if name == "" {
		return model.Topic{}, errs.ErrEmptyName
	}

	return s.topicRepo.UpdateTopic(userID, topicID, name)
}

// DeleteTopic удаляет топик вместе с заметками и файлами вложений.
func (s *Service) DeleteTopic(userID, topicID int64) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	notes, err := s.noteRepo.ListNotes(userID, topicID, nil)
	if err != nil {
		return err
	}
	for _, n := range notes {
		if err := s.deleteNoteFiles(n.ID); err != nil {
			return err
		}
	}
	return s.topicRepo.DeleteTopic(userID, topicID)
}

// --- Notes ---

// AddNote добавляет новую заметку с указанным приоритетом и форматированием.
func (s *Service) AddNote(userID, topicID int64, folderID *int64, text string, entities []model.NoteEntity, priority model.Priority) (model.Note, error) {
	unlock := s.locks.Lock(userID)
	defer unlock()

	note, err := model.NewNote(userID, topicID, folderID, text, entities)
	if err != nil {
		return model.Note{}, err
	}

	if err := note.SetPriority(priority); err != nil {
		return model.Note{}, err
	}
	return s.noteRepo.CreateNote(*note)
}

// ListNotes возвращает список заметок пользователя (с фильтрацией по топику и папке).
// Закреплённые заметки идут первыми, затем активные по приоритету
// (High > Medium > None > Low). Выполненные заметки идут после всех активных.
func (s *Service) ListNotes(userID, topicID int64, folderID *int64) ([]model.Note, error) {
	notes, err := s.noteRepo.ListNotes(userID, topicID, folderID)
	if err != nil {
		return nil, err
	}

	sort.Slice(notes, func(i, j int) bool {
		// Закреплённые — в начало (истёкшее закрепление = откреплено)
		if notes[i].IsPinned() != notes[j].IsPinned() {
			return notes[i].IsPinned()
		}
		// Выполненные — в конец
		if notes[i].Done != notes[j].Done {
			return !notes[i].Done
		}
		// Внутри группы — по приоритету
		return notes[i].Priority.SortKey() < notes[j].Priority.SortKey()
	})

	return notes, nil
}

// GetNote возвращает заметку по ID.
func (s *Service) GetNote(userID, noteID int64) (model.Note, error) {
	return s.noteRepo.GetNote(userID, noteID)
}

// EditNote обновляет текст заметки и его форматирование.
// Если новый текст совпадает со старым, а форматирование не было передано
// (кнопка ✏️ подставляет в поле ввода plain-текст — entities Telegram не
// передаёт), — форматирование сохраняется как было.
func (s *Service) EditNote(userID, noteID int64, text string, entities []model.NoteEntity) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	if len(entities) == 0 && text == note.Text {
		entities = note.Entities
	}

	if err := note.EditText(text, entities); err != nil {
		return err
	}

	return s.noteRepo.UpdateNote(note)
}

// DeleteNote удаляет заметку вместе с файлами вложений.
func (s *Service) DeleteNote(userID, noteID int64) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	if _, err := s.noteRepo.GetNote(userID, noteID); err != nil {
		return err
	}
	if err := s.deleteNoteFiles(noteID); err != nil {
		return err
	}
	return s.noteRepo.DeleteNote(userID, noteID)
}

// ArchiveNote архивирует заметку.
func (s *Service) ArchiveNote(userID, noteID int64) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.Archive()
	return s.noteRepo.UpdateNote(note)
}

// UnarchiveNote разархивирует заметку.
func (s *Service) UnarchiveNote(userID, noteID int64) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.Unarchive()
	return s.noteRepo.UpdateNote(note)
}

// MarkDone помечает заметку как выполненную.
func (s *Service) MarkDone(userID, noteID int64) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.MarkDone()
	return s.noteRepo.UpdateNote(note)
}

// MarkUndone снимает отметку выполнения с заметки.
func (s *Service) MarkUndone(userID, noteID int64) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.MarkUndone()
	return s.noteRepo.UpdateNote(note)
}

// PinNote закрепляет заметку постоянно (всегда вверху списка).
func (s *Service) PinNote(userID, noteID int64) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.Pin()
	return s.noteRepo.UpdateNote(note)
}

// PinNoteUntil закрепляет заметку до указанного времени (после — открепляется сама).
func (s *Service) PinNoteUntil(userID, noteID int64, at time.Time) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.PinUntil(at)
	return s.noteRepo.UpdateNote(note)
}

// UnpinNote открепляет заметку.
func (s *Service) UnpinNote(userID, noteID int64) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.Unpin()
	return s.noteRepo.UpdateNote(note)
}

// ProcessExpiredPins открепляет заметки с истёкшим сроком закрепления.
// Каждая заметка повторно читается под локом пользователя, чтобы не затирать
// правки, сделанные между выборкой и записью (например, продление срока).
func (s *Service) ProcessExpiredPins() error {
	notes, err := s.noteRepo.GetExpiredPins()
	if err != nil {
		return err
	}

	for _, n := range notes {
		unlock := s.locks.Lock(n.UserID)
		current, err := s.noteRepo.GetNote(n.UserID, n.ID)
		if err != nil {
			// Заметка удалена между выборкой и локом — пропускаем.
			slog.Warn("закрепление: заметка недоступна", "note_id", n.ID, "error", err)
			unlock()
			continue
		}
		if current.PinnedUntil == nil || current.PinnedUntil.After(time.Now().UTC()) {
			unlock()
			continue // уже откреплено или срок продлён пользователем
		}

		current.Unpin()
		if err := s.noteRepo.UpdateNote(current); err != nil {
			slog.Error("открепление заметки", "note_id", current.ID, "error", err)
			unlock()
			return err
		}
		unlock()
	}

	return nil
}

// SetPriority меняет приоритет заметки.
func (s *Service) SetPriority(userID, noteID int64, priority model.Priority) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	if err := note.SetPriority(priority); err != nil {
		return err
	}
	return s.noteRepo.UpdateNote(note)
}

// SetReminder устанавливает напоминание на заметку.
func (s *Service) SetReminder(userID, noteID int64, at time.Time, repeat model.ReminderRepeat) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	if err := note.SetReminder(at, repeat); err != nil {
		return err
	}
	return s.noteRepo.UpdateNote(note)
}

// ClearReminder убирает напоминание с заметки.
func (s *Service) ClearReminder(userID, noteID int64) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}

	note.ClearReminder()
	return s.noteRepo.UpdateNote(note)
}

// SnoozeReminder откладывает напоминание на указанное число минут,
// сохраняя тип повторения (одноразовое / ежедневное).
func (s *Service) SnoozeReminder(userID, noteID int64, minutes int) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	note, err := s.noteRepo.GetNote(userID, noteID)
	if err != nil {
		return err
	}
	if note.ReminderAt == nil || minutes <= 0 {
		return nil // напоминания нет — откладывать нечего
	}

	at := time.Now().UTC().Add(time.Duration(minutes) * time.Minute)
	if err := note.SetReminder(at, note.ReminderRepeat); err != nil {
		return err
	}
	return s.noteRepo.UpdateNote(note)
}

// ProcessPendingReminders возвращает заметки с просроченными напоминаниями.
// Для одноразовых — сбрасывает ReminderAt. Для ежедневных — сдвигает на 24 часа.
// Каждая заметка повторно читается под локом пользователя, чтобы обновление
// не затирало правки, сделанные между выборкой и записью.
func (s *Service) ProcessPendingReminders() ([]model.Note, error) {
	notes, err := s.noteRepo.GetPendingReminders()
	if err != nil {
		return nil, err
	}

	var due []model.Note
	for _, n := range notes {
		unlock := s.locks.Lock(n.UserID)
		current, err := s.noteRepo.GetNote(n.UserID, n.ID)
		if err != nil {
			// Заметка удалена между выборкой и локом — пропускаем.
			slog.Warn("напоминание: заметка недоступна", "note_id", n.ID, "error", err)
			unlock()
			continue
		}
		if current.ReminderAt == nil || current.ReminderAt.After(time.Now().UTC()) {
			unlock()
			continue // уже обработано или изменено пользователем
		}

		if current.ReminderRepeat == model.ReminderRepeatDaily {
			next := current.ReminderAt.Add(24 * time.Hour)
			if err := current.SetReminder(next, model.ReminderRepeatDaily); err != nil {
				unlock()
				return nil, err
			}
		} else {
			current.ClearReminder()
		}

		if err := s.noteRepo.UpdateNote(current); err != nil {
			slog.Error("обновление напоминания", "note_id", current.ID, "error", err)
			unlock()
			return nil, err
		}
		unlock()
		due = append(due, current)
	}

	return due, nil
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
	unlock := s.locks.Lock(userID)
	defer unlock()

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

	defaults := []struct {
		topicID int64
		text    string
	}{
		{personal.ID, "Купить продукты: хлеб, молоко, яйца"},
		{personal.ID, "Записаться к стоматологу"},
		{personal.ID, "Позвонить родителям"},
		{work.ID, "Подготовить отчёт за квартал"},
		{work.ID, "Созвон с командой в 15:00"},
	}
	for _, d := range defaults {
		note, err := model.NewNote(userID, d.topicID, nil, d.text, nil)
		if err != nil {
			return err
		}
		if _, err := s.noteRepo.CreateNote(*note); err != nil {
			return err
		}
	}

	return nil
}

// --- Folders ---

// CreateFolder создаёт новую папку.
func (s *Service) CreateFolder(userID, topicID int64, parentFolderID *int64, name string) (model.Folder, error) {
	unlock := s.locks.Lock(userID)
	defer unlock()

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

// ListAllFolders возвращает все папки топика (все уровни вложенности).
func (s *Service) ListAllFolders(userID, topicID int64) ([]model.Folder, error) {
	return s.folderRepo.ListAllFolders(userID, topicID)
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

// RenameFolder переименовывает папку.
func (s *Service) RenameFolder(userID, folderID int64, name string) (model.Folder, error) {
	unlock := s.locks.Lock(userID)
	defer unlock()

	if name == "" {
		return model.Folder{}, errs.ErrEmptyFolderName
	}
	return s.folderRepo.RenameFolder(userID, folderID, name)
}

// DeleteFolder удаляет папку со всеми подпапками и заметками в них.
func (s *Service) DeleteFolder(userID, folderID int64) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	return s.folderRepo.DeleteFolder(userID, folderID)
}

// MoveNote перемещает заметку в другой топик и/или папку.
func (s *Service) MoveNote(userID, noteID int64, topicID int64, folderID *int64) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	// Дыра: без проверки folderID может указывать на папку другого топика
	// или другого пользователя. Закрываем — папка должна существовать,
	// принадлежать пользователю и относиться к целевому топику.
	if folderID != nil {
		folder, err := s.folderRepo.GetFolder(userID, *folderID)
		if err != nil {
			return err
		}
		if folder.TopicID != topicID {
			return errs.ErrFolderNotFound
		}
	}
	return s.noteRepo.MoveNote(userID, noteID, topicID, folderID)
}

// --- Attachments ---

// AddAttachment сохраняет файл на диск и создаёт запись вложения для заметки.
// Файл сохраняется только после проверки, что заметка принадлежит пользователю.
func (s *Service) AddAttachment(userID, noteID int64, attType model.AttachmentType, fileID, fileName, mimeType string, fileSize int64, data []byte) (model.Attachment, error) {
	unlock := s.locks.Lock(userID)
	defer unlock()

	if _, err := s.noteRepo.GetNote(userID, noteID); err != nil {
		return model.Attachment{}, err
	}
	if _, err := model.NewAttachmentType(string(attType)); err != nil {
		return model.Attachment{}, err
	}
	if len(data) == 0 {
		return model.Attachment{}, errs.ErrEmptyFile
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
		return model.Attachment{}, errs.ErrAttachmentNotFound
	}
	return att, nil
}

// DeleteAttachment удаляет вложение: файл с диска и запись.
func (s *Service) DeleteAttachment(userID, attID int64) error {
	unlock := s.locks.Lock(userID)
	defer unlock()

	att, err := s.attRepo.GetAttachment(attID)
	if err != nil {
		return err
	}
	if att.UserID != userID {
		return errs.ErrAttachmentNotFound
	}
	if err := s.fileStore.Delete(att.FilePath); err != nil {
		return err
	}
	return s.attRepo.DeleteAttachment(attID)
}

// --- Settings ---

// GetSettings возвращает настройки пользователя.
// Если записи в хранилище ещё нет — возвращает значения по умолчанию.
func (s *Service) GetSettings(userID int64) (model.UserSettings, error) {
	settings, err := s.settingsRepo.GetSettings(userID)
	if errors.Is(err, errs.ErrSettingsNotFound) {
		return model.NewUserSettings(userID), nil
	}
	if err != nil {
		return model.UserSettings{}, err
	}
	return settings, nil
}

// SaveSettings сохраняет настройки пользователя.
func (s *Service) SaveSettings(settings model.UserSettings) error {
	unlock := s.locks.Lock(settings.UserID)
	defer unlock()
	return s.settingsRepo.SaveSettings(settings)
}

// deleteNoteFiles удаляет файлы всех вложений заметки (вызывается под локом пользователя).
func (s *Service) deleteNoteFiles(noteID int64) error {
	atts, err := s.attRepo.ListAttachments(noteID)
	if err != nil {
		return fmt.Errorf("список вложений заметки %d: %w", noteID, err)
	}
	for _, a := range atts {
		if err := s.fileStore.Delete(a.FilePath); err != nil {
			return fmt.Errorf("удаление файла вложения %s: %w", a.FilePath, err)
		}
	}
	return nil
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
