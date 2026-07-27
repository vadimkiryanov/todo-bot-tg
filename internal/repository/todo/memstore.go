package todo

import (
	"fmt"
	"sync"

	"todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/model"
	"todo-bot-tg/internal/repository/todo/entity"
)

// MemStore — in-memory реализация репозитория.
type MemStore struct {
	mu          sync.RWMutex
	topics      map[int64]entity.TopicRecord
	notes       map[int64]entity.NoteRecord
	nextTopicID int64
	nextNoteID  int64
	userTopics  map[int64][]int64 // userID → []topicID
	userNotes   map[int64][]int64 // userID → []noteID
}

// NewMemStore создаёт новый MemStore.
func NewMemStore() *MemStore {
	return &MemStore{
		topics:     make(map[int64]entity.TopicRecord),
		notes:      make(map[int64]entity.NoteRecord),
		userTopics: make(map[int64][]int64),
		userNotes:  make(map[int64][]int64),
		nextTopicID: 1,
		nextNoteID:  1,
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

	// Удаляем заметки топика
	for _, nid := range s.userNotes[userID] {
		if n, ok := s.notes[nid]; ok && n.TopicID == topicID {
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

func (s *MemStore) ListNotes(userID, topicID int64) ([]model.Note, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := s.userNotes[userID]
	result := make([]model.Note, 0, len(ids))
	for _, id := range ids {
		n, ok := s.notes[id]
		if !ok || n.Archived {
			continue
		}
		if topicID == 0 || n.TopicID == topicID {
			result = append(result, entity.NoteFromRecord(n))
		}
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

func (s *MemStore) CountNotes(userID, topicID int64) (int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	count := 0
	for _, id := range s.userNotes[userID] {
		n, ok := s.notes[id]
		if !ok || n.Archived {
			continue
		}
		if topicID == 0 || n.TopicID == topicID {
			count++
		}
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

// HasAnyData возвращает true, если у пользователя уже есть данные.
func (s *MemStore) HasAnyData(userID int64) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.userTopics[userID]) > 0 || len(s.userNotes[userID]) > 0
}

// compile-time assertion
var _ = fmt.Sprintf("%T", (*MemStore)(nil))
