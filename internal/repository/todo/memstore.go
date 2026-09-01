package todo

import (
	"fmt"
	"sync"
	"time"

	"todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/model"
	"todo-bot-tg/internal/repository/todo/entity"
)

// MemStore — in-memory реализация репозитория.
type MemStore struct {
	mu           sync.RWMutex
	topics       map[int64]entity.TopicRecord
	notes        map[int64]entity.NoteRecord
	folders      map[int64]entity.FolderRecord
	attachments  map[int64]entity.AttachmentRecord
	settings     map[int64]entity.SettingsRecord
	nextTopicID  int64
	nextNoteID   int64
	nextFolderID int64
	nextAttID    int64
	userTopics   map[int64][]int64 // userID → []topicID
	userNotes    map[int64][]int64 // userID → []noteID
	userFolders  map[int64][]int64 // userID → []folderID
	noteAtts     map[int64][]int64 // noteID → []attachmentID
	quickTopics  map[int64][]int64 // userID → []topicID (выбранные для быстрых кнопок)
	users        map[int64]entity.UserRecord
	usernameIdx  map[string]int64 // username (lowercase) → userID
	telegramIdx  map[int64]int64  // telegram_id → userID
	nextUserID   int64
}

// NewMemStore создаёт новый MemStore.
func NewMemStore() *MemStore {
	return &MemStore{
		topics:       make(map[int64]entity.TopicRecord),
		notes:        make(map[int64]entity.NoteRecord),
		folders:      make(map[int64]entity.FolderRecord),
		attachments:  make(map[int64]entity.AttachmentRecord),
		settings:     make(map[int64]entity.SettingsRecord),
		userTopics:   make(map[int64][]int64),
		userNotes:    make(map[int64][]int64),
		userFolders:  make(map[int64][]int64),
		noteAtts:     make(map[int64][]int64),
		quickTopics:  make(map[int64][]int64),
		users:        make(map[int64]entity.UserRecord),
		usernameIdx:  make(map[string]int64),
		telegramIdx:  make(map[int64]int64),
		nextTopicID:  1,
		nextNoteID:   1,
		nextFolderID: 1,
		nextAttID:    1,
		nextUserID:   1,
	}
}

// --- Topics ---

func (s *MemStore) CreateTopic(userID int64, name string) (model.Topic, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, tid := range s.userTopics[userID] {
		if s.topics[tid].Name == name {
			return model.Topic{}, errors.ErrTopicAlreadyExists
		}
	}

	t := entity.TopicRecord{ID: s.nextTopicID, UserID: userID, Name: name}
	s.topics[t.ID] = t
	s.userTopics[userID] = append(s.userTopics[userID], t.ID)
	s.nextTopicID++
	return entity.TopicFromRecord(t), nil
}

func (s *MemStore) ListTopics(userID int64) ([]model.Topic, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := s.userTopics[userID]
	result := make([]model.Topic, 0, len(ids))
	for _, id := range ids {
		if t, ok := s.topics[id]; ok {
			result = append(result, entity.TopicFromRecord(t))
		}
	}
	return result, nil
}

func (s *MemStore) GetTopic(userID, topicID int64) (model.Topic, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	t, ok := s.topics[topicID]
	if !ok || t.UserID != userID {
		return model.Topic{}, errors.ErrTopicNotFound
	}
	return entity.TopicFromRecord(t), nil
}

func (s *MemStore) UpdateTopic(userID, topicID int64, name string) (model.Topic, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	t, ok := s.topics[topicID]
	if !ok || t.UserID != userID {
		return model.Topic{}, errors.ErrTopicNotFound
	}

	for _, tid := range s.userTopics[userID] {
		if tid != topicID && s.topics[tid].Name == name {
			return model.Topic{}, errors.ErrTopicAlreadyExists
		}
	}

	t.Name = name
	s.topics[topicID] = t
	return entity.TopicFromRecord(t), nil
}

func (s *MemStore) DeleteTopic(userID, topicID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	t, ok := s.topics[topicID]
	if !ok || t.UserID != userID {
		return errors.ErrTopicNotFound
	}

	delete(s.topics, topicID)
	ids := s.userTopics[userID]
	for i, id := range ids {
		if id == topicID {
			s.userTopics[userID] = append(ids[:i], ids[i+1:]...)
			break
		}
	}

	// Убираем удалённый топик из выбранных для быстрых кнопок
	quick := s.quickTopics[userID]
	for i, id := range quick {
		if id == topicID {
			s.quickTopics[userID] = append(quick[:i], quick[i+1:]...)
			break
		}
	}

	// Удаляем заметки топика и их вложения
	for _, nid := range s.userNotes[userID] {
		if n, ok := s.notes[nid]; ok && n.TopicID == topicID {
			s.deleteAttachmentsLocked(nid)
			delete(s.notes, nid)
		}
	}
	filtered := make([]int64, 0, len(s.userNotes[userID]))
	for _, nid := range s.userNotes[userID] {
		if n, ok := s.notes[nid]; ok && n.TopicID != topicID {
			filtered = append(filtered, nid)
		}
	}
	s.userNotes[userID] = filtered

	// Удаляем папки топика (все уровни вложенности — они привязаны к topicID)
	filteredFolders := make([]int64, 0, len(s.userFolders[userID]))
	for _, fid := range s.userFolders[userID] {
		f, ok := s.folders[fid]
		if ok && f.TopicID == topicID {
			delete(s.folders, fid)
			continue
		}
		filteredFolders = append(filteredFolders, fid)
	}
	s.userFolders[userID] = filteredFolders

	_ = t // used for validation above
	return nil
}

// --- Notes ---

func (s *MemStore) CreateNote(note model.Note) (model.Note, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	note.ID = s.nextNoteID
	s.nextNoteID++

	n := entity.NoteToRecord(note)
	s.notes[n.ID] = n
	s.userNotes[note.UserID] = append(s.userNotes[note.UserID], n.ID)
	return entity.NoteFromRecord(n), nil
}

func (s *MemStore) ListNotes(userID, topicID int64, folderID *int64) ([]model.Note, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := s.userNotes[userID]
	result := make([]model.Note, 0, len(ids))
	for _, id := range ids {
		n, ok := s.notes[id]
		if !ok || n.Archived {
			continue
		}
		if topicID != 0 && n.TopicID != topicID {
			continue
		}
		if folderID != nil {
			if n.FolderID == nil || *n.FolderID != *folderID {
				continue
			}
		}
		result = append(result, entity.NoteFromRecord(n))
	}
	return result, nil
}

func (s *MemStore) GetNote(userID, noteID int64) (model.Note, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	n, ok := s.notes[noteID]
	if !ok || n.UserID != userID {
		return model.Note{}, errors.ErrNoteNotFound
	}
	return entity.NoteFromRecord(n), nil
}

func (s *MemStore) UpdateNote(note model.Note) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	n, ok := s.notes[note.ID]
	if !ok || n.UserID != note.UserID {
		return errors.ErrNoteNotFound
	}
	s.notes[note.ID] = entity.NoteToRecord(note)
	return nil
}

func (s *MemStore) DeleteNote(userID, noteID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	n, ok := s.notes[noteID]
	if !ok || n.UserID != userID {
		return errors.ErrNoteNotFound
	}
	s.deleteAttachmentsLocked(noteID)
	delete(s.notes, noteID)
	ids := s.userNotes[userID]
	for i, id := range ids {
		if id == noteID {
			s.userNotes[userID] = append(ids[:i], ids[i+1:]...)
			break
		}
	}
	return nil
}

// deleteAttachmentsLocked удаляет вложения заметки (требует Lock).
func (s *MemStore) deleteAttachmentsLocked(noteID int64) {
	for _, aid := range s.noteAtts[noteID] {
		delete(s.attachments, aid)
	}
	delete(s.noteAtts, noteID)
}

// CountDoneNotes возвращает количество выполненных заметок в топике/папке.
func (s *MemStore) CountDoneNotes(userID, topicID int64, folderID *int64) (int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	count := 0
	for _, id := range s.userNotes[userID] {
		n, ok := s.notes[id]
		if !ok || n.Archived || !n.Done {
			continue
		}
		if topicID != 0 && n.TopicID != topicID {
			continue
		}
		if folderID != nil && n.FolderID == nil {
			continue
		}
		if folderID == nil && n.FolderID != nil {
			continue
		}
		if folderID != nil && n.FolderID != nil && *n.FolderID != *folderID {
			continue
		}
		count++
	}
	return count, nil
}

func (s *MemStore) CountNotes(userID, topicID int64, folderID *int64) (int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	count := 0
	for _, id := range s.userNotes[userID] {
		n, ok := s.notes[id]
		if !ok || n.Archived {
			continue
		}
		if topicID != 0 && n.TopicID != topicID {
			continue
		}
		if folderID != nil {
			if n.FolderID == nil || *n.FolderID != *folderID {
				continue
			}
		}
		count++
	}
	return count, nil
}

func (s *MemStore) ListArchived(userID int64) ([]model.Note, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := s.userNotes[userID]
	result := make([]model.Note, 0, len(ids))
	for _, id := range ids {
		n, ok := s.notes[id]
		if ok && n.Archived {
			result = append(result, entity.NoteFromRecord(n))
		}
	}
	return result, nil
}

// ListDone возвращает выполненные (не архивные) заметки пользователя — все топики.
func (s *MemStore) ListDone(userID int64) ([]model.Note, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := s.userNotes[userID]
	result := make([]model.Note, 0, len(ids))
	for _, id := range ids {
		n, ok := s.notes[id]
		if ok && n.Done && !n.Archived {
			result = append(result, entity.NoteFromRecord(n))
		}
	}
	return result, nil
}

func (s *MemStore) CountArchived(userID int64) (int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	count := 0
	for _, id := range s.userNotes[userID] {
		n, ok := s.notes[id]
		if ok && n.Archived {
			count++
		}
	}
	return count, nil
}

// GetPendingReminders возвращает заметки с просроченными напоминаниями.
func (s *MemStore) GetPendingReminders() ([]model.Note, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	now := time.Now().UTC()
	var result []model.Note
	for _, n := range s.notes {
		if n.ReminderAt != nil && !n.ReminderAt.After(now) && !n.Archived {
			result = append(result, entity.NoteFromRecord(n))
		}
	}
	return result, nil
}

// GetExpiredPins возвращает заметки с истёкшим сроком закрепления.
func (s *MemStore) GetExpiredPins() ([]model.Note, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	now := time.Now().UTC()
	var result []model.Note
	for _, n := range s.notes {
		if n.Pinned && n.PinnedUntil != nil && !n.PinnedUntil.After(now) {
			result = append(result, entity.NoteFromRecord(n))
		}
	}
	return result, nil
}

// HasAnyData возвращает true, если у пользователя уже есть данные.
func (s *MemStore) HasAnyData(userID int64) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.userTopics[userID]) > 0 || len(s.userNotes[userID]) > 0
}

// --- Folders ---

func (s *MemStore) CreateFolder(folder model.Folder) (model.Folder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Проверяем уникальность имени в рамках родителя
	for _, fid := range s.userFolders[folder.UserID] {
		f := s.folders[fid]
		if f.TopicID == folder.TopicID && f.Name == folder.Name {
			if (folder.ParentFolderID == nil && f.ParentFolderID == nil) ||
				(folder.ParentFolderID != nil && f.ParentFolderID != nil && *f.ParentFolderID == *folder.ParentFolderID) {
				return model.Folder{}, errors.ErrFolderAlreadyExists
			}
		}
	}

	folder.ID = s.nextFolderID
	s.nextFolderID++

	f := entity.FolderToRecord(folder)
	s.folders[f.ID] = f
	s.userFolders[folder.UserID] = append(s.userFolders[folder.UserID], f.ID)
	return entity.FolderFromRecord(f), nil
}

func (s *MemStore) ListFolders(userID, topicID int64, parentFolderID *int64) ([]model.Folder, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := s.userFolders[userID]
	result := make([]model.Folder, 0, len(ids))
	for _, id := range ids {
		f, ok := s.folders[id]
		if !ok || f.TopicID != topicID {
			continue
		}
		if parentFolderID == nil {
			if f.ParentFolderID != nil {
				continue
			}
		} else {
			if f.ParentFolderID == nil || *f.ParentFolderID != *parentFolderID {
				continue
			}
		}
		result = append(result, entity.FolderFromRecord(f))
	}
	return result, nil
}

func (s *MemStore) ListAllFolders(userID, topicID int64) ([]model.Folder, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := s.userFolders[userID]
	result := make([]model.Folder, 0, len(ids))
	for _, id := range ids {
		f, ok := s.folders[id]
		if !ok || f.TopicID != topicID {
			continue
		}
		result = append(result, entity.FolderFromRecord(f))
	}
	return result, nil
}

func (s *MemStore) GetFolder(userID, folderID int64) (model.Folder, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	f, ok := s.folders[folderID]
	if !ok || f.UserID != userID {
		return model.Folder{}, errors.ErrFolderNotFound
	}
	return entity.FolderFromRecord(f), nil
}

func (s *MemStore) CountFolders(userID, topicID int64, parentFolderID *int64) (int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	count := 0
	for _, id := range s.userFolders[userID] {
		f, ok := s.folders[id]
		if !ok || f.TopicID != topicID {
			continue
		}
		if parentFolderID == nil {
			if f.ParentFolderID == nil {
				count++
			}
		} else {
			if f.ParentFolderID != nil && *f.ParentFolderID == *parentFolderID {
				count++
			}
		}
	}
	return count, nil
}

func (s *MemStore) GetFolderChain(folderID int64) ([]model.Folder, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var chain []model.Folder
	currentID := &folderID
	visited := make(map[int64]bool)

	for currentID != nil {
		if visited[*currentID] {
			break // защита от циклов
		}
		visited[*currentID] = true

		f, ok := s.folders[*currentID]
		if !ok {
			break
		}
		// Вставляем в начало (идём от потомка к корню)
		chain = append([]model.Folder{entity.FolderFromRecord(f)}, chain...)
		currentID = f.ParentFolderID
	}
	return chain, nil
}

// compile-time assertion
var _ = fmt.Sprintf("%T", (*MemStore)(nil))

// RenameFolder переименовывает папку (с проверкой уникальности имени среди соседей).
func (s *MemStore) RenameFolder(userID, folderID int64, name string) (model.Folder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	f, ok := s.folders[folderID]
	if !ok || f.UserID != userID {
		return model.Folder{}, errors.ErrFolderNotFound
	}
	if name == "" {
		return model.Folder{}, errors.ErrEmptyFolderName
	}

	for _, id := range s.userFolders[userID] {
		other, exists := s.folders[id]
		if !exists || id == folderID || other.TopicID != f.TopicID {
			continue
		}
		if other.Name != name {
			continue
		}
		if (f.ParentFolderID == nil && other.ParentFolderID == nil) ||
			(f.ParentFolderID != nil && other.ParentFolderID != nil &&
				*f.ParentFolderID == *other.ParentFolderID) {
			return model.Folder{}, errors.ErrFolderAlreadyExists
		}
	}

	f.Name = name
	s.folders[folderID] = f
	return entity.FolderFromRecord(f), nil
}

// DeleteFolder удаляет папку со всеми подпапками (рекурсивно) и заметками в них.
func (s *MemStore) DeleteFolder(userID, folderID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.folders[folderID]; !ok {
		return errors.ErrFolderNotFound
	}
	// Владельца проверяем в collectFolderIDsLocked (первая папка — пользовательская).
	ids := s.collectFolderIDsLocked(userID, folderID)
	if len(ids) == 0 {
		return errors.ErrFolderNotFound
	}

	// Удаляем заметки всех папок (с вложениями) и сами папки.
	for _, id := range ids {
		for _, nid := range s.userNotes[userID] {
			n, ok := s.notes[nid]
			if !ok || n.FolderID == nil || *n.FolderID != id {
				continue
			}
			s.deleteAttachmentsLocked(nid)
			delete(s.notes, nid)
		}
		filtered := make([]int64, 0, len(s.userNotes[userID]))
		for _, nid := range s.userNotes[userID] {
			n, ok := s.notes[nid]
			if !ok || n.FolderID == nil || *n.FolderID != id {
				filtered = append(filtered, nid)
			}
		}
		s.userNotes[userID] = filtered
		delete(s.folders, id)
	}
	filteredFolders := make([]int64, 0, len(s.userFolders[userID]))
	for _, id := range s.userFolders[userID] {
		found := false
		for _, del := range ids {
			if id == del {
				found = true
				break
			}
		}
		if !found {
			filteredFolders = append(filteredFolders, id)
		}
	}
	s.userFolders[userID] = filteredFolders
	return nil
}

// collectFolderIDsLocked собирает id удаляемой папки и всех её подпапок (BFS).
// Пустой результат — папка не принадлежит пользователю.
func (s *MemStore) collectFolderIDsLocked(userID, folderID int64) []int64 {
	root, ok := s.folders[folderID]
	if !ok || root.UserID != userID {
		return nil
	}
	ids := []int64{folderID}
	for i := 0; i < len(ids); i++ {
		for _, id := range s.userFolders[userID] {
			f, ok := s.folders[id]
			if !ok || f.ParentFolderID == nil || *f.ParentFolderID != ids[i] {
				continue
			}
			ids = append(ids, id)
		}
	}
	return ids
}

// MoveNote перемещает заметку в другой топик и/или папку.
func (s *MemStore) MoveNote(userID, noteID int64, topicID int64, folderID *int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	n, ok := s.notes[noteID]
	if !ok || n.UserID != userID {
		return errors.ErrNoteNotFound
	}
	n.TopicID = topicID
	n.FolderID = folderID
	s.notes[noteID] = n
	return nil
}

// --- Attachments ---

func (s *MemStore) CreateAttachment(att model.Attachment) (model.Attachment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	att.ID = s.nextAttID
	s.nextAttID++

	rec := entity.AttachmentToRecord(att)
	s.attachments[rec.ID] = rec
	s.noteAtts[att.NoteID] = append(s.noteAtts[att.NoteID], rec.ID)
	return entity.AttachmentFromRecord(rec), nil
}

func (s *MemStore) ListAttachments(noteID int64) ([]model.Attachment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := s.noteAtts[noteID]
	result := make([]model.Attachment, 0, len(ids))
	for _, id := range ids {
		if a, ok := s.attachments[id]; ok {
			result = append(result, entity.AttachmentFromRecord(a))
		}
	}
	return result, nil
}

func (s *MemStore) GetAttachment(attID int64) (model.Attachment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	a, ok := s.attachments[attID]
	if !ok {
		return model.Attachment{}, errors.ErrAttachmentNotFound
	}
	return entity.AttachmentFromRecord(a), nil
}

func (s *MemStore) DeleteAttachment(attID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	a, ok := s.attachments[attID]
	if !ok {
		return errors.ErrAttachmentNotFound
	}
	delete(s.attachments, attID)

	ids := s.noteAtts[a.NoteID]
	for i, id := range ids {
		if id == attID {
			s.noteAtts[a.NoteID] = append(ids[:i], ids[i+1:]...)
			break
		}
	}
	return nil
}

// --- Settings ---

// GetSettings возвращает настройки пользователя (ErrSettingsNotFound — записи нет).
func (s *MemStore) GetSettings(userID int64) (model.UserSettings, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rec, ok := s.settings[userID]
	if !ok {
		return model.UserSettings{}, errors.ErrSettingsNotFound
	}
	settings := entity.SettingsFromRecord(rec)
	settings.QuickTopicIDs = append([]int64(nil), s.quickTopics[userID]...)
	return settings, nil
}

// SaveSettings сохраняет (создаёт или обновляет) настройки пользователя.
func (s *MemStore) SaveSettings(settings model.UserSettings) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.settings[settings.UserID] = entity.SettingsToRecord(settings)
	s.quickTopics[settings.UserID] = append([]int64(nil), settings.QuickTopicIDs...)
	return nil
}
