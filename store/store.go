package store

import (
	"fmt"
	"sync"
	"time"
)

// Topic представляет топик (категорию) пользователя.
type Topic struct {
	ID     int64
	UserID int64
	Name   string
}

// Note представляет заметку.
type Note struct {
	ID        int64
	UserID    int64
	TopicID   int64 // 0 — без топика
	Text      string
	CreatedAt time.Time
	Archived  bool
}

// Store — интерфейс хранилища.
type Store interface {
	// Topics
	CreateTopic(userID int64, name string) (*Topic, error)
	ListTopics(userID int64) ([]Topic, error)
	GetTopic(userID int64, topicID int64) (*Topic, error)
	DeleteTopic(userID int64, topicID int64) error

	// Notes
	Add(userID int64, topicID int64, text string) (*Note, error)
	List(userID int64, topicID int64) ([]Note, error)
	Get(userID int64, noteID int64) (*Note, error)
	Edit(userID int64, noteID int64, text string) error
	Delete(userID int64, noteID int64) error
	Archive(userID int64, noteID int64) error
	Unarchive(userID int64, noteID int64) error
	CountNotes(userID int64, topicID int64) (int, error)
	ListArchived(userID int64) ([]Note, error)
	CountArchived(userID int64) (int, error)
}

// MemStore — in-memory реализация Store.
type MemStore struct {
	mu        sync.RWMutex
	topics    map[int64]*Topic
	notes     map[int64]*Note
	nextTopicID int64
	nextNoteID  int64
	userTopics  map[int64][]int64
	userNotes   map[int64][]int64
}

// NewMemStore создаёт новый MemStore.
func NewMemStore() *MemStore {
	return &MemStore{
		topics:    make(map[int64]*Topic),
		notes:     make(map[int64]*Note),
		userTopics: make(map[int64][]int64),
		userNotes:  make(map[int64][]int64),
		nextTopicID: 1,
		nextNoteID:  1,
	}
}

// --- Topics ---

func (s *MemStore) CreateTopic(userID int64, name string) (*Topic, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Проверяем дубликат имени
	for _, tid := range s.userTopics[userID] {
		if s.topics[tid].Name == name {
			return nil, fmt.Errorf("топик «%s» уже существует", name)
		}
	}

	t := &Topic{ID: s.nextTopicID, UserID: userID, Name: name}
	s.topics[t.ID] = t
	s.userTopics[userID] = append(s.userTopics[userID], t.ID)
	s.nextTopicID++
	return t, nil
}

func (s *MemStore) ListTopics(userID int64) ([]Topic, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := s.userTopics[userID]
	result := make([]Topic, 0, len(ids))
	for _, id := range ids {
		if t := s.topics[id]; t != nil {
			result = append(result, *t)
		}
	}
	return result, nil
}

func (s *MemStore) GetTopic(userID int64, topicID int64) (*Topic, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	t, ok := s.topics[topicID]
	if !ok || t.UserID != userID {
		return nil, fmt.Errorf("топик #%d не найден", topicID)
	}
	return t, nil
}

func (s *MemStore) DeleteTopic(userID int64, topicID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	t, ok := s.topics[topicID]
	if !ok || t.UserID != userID {
		return fmt.Errorf("топик #%d не найден", topicID)
	}

	delete(s.topics, topicID)
	ids := s.userTopics[userID]
	for i, id := range ids {
		if id == topicID {
			s.userTopics[userID] = append(ids[:i], ids[i+1:]...)
			break
		}
	}

	// Удаляем все заметки в этом топике
	for _, nid := range s.userNotes[userID] {
		if n := s.notes[nid]; n != nil && n.TopicID == topicID {
			delete(s.notes, nid)
		}
	}
	// Чистим userNotes
	filtered := make([]int64, 0, len(s.userNotes[userID]))
	for _, nid := range s.userNotes[userID] {
		if n := s.notes[nid]; n != nil && n.TopicID != topicID {
			filtered = append(filtered, nid)
		}
	}
	s.userNotes[userID] = filtered

	return nil
}

// --- Notes ---

func (s *MemStore) Add(userID int64, topicID int64, text string) (*Note, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	note := &Note{
		ID:        s.nextNoteID,
		UserID:    userID,
		TopicID:   topicID,
		Text:      text,
		CreatedAt: time.Now(),
	}
	s.notes[note.ID] = note
	s.userNotes[userID] = append(s.userNotes[userID], note.ID)
	s.nextNoteID++
	return note, nil
}

func (s *MemStore) List(userID int64, topicID int64) ([]Note, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := s.userNotes[userID]
	result := make([]Note, 0, len(ids))
	for _, id := range ids {
		note := s.notes[id]
		if note != nil && !note.Archived {
			// topicID == 0 значит «все топики», иначе фильтруем
			if topicID == 0 || note.TopicID == topicID {
				result = append(result, *note)
			}
		}
	}
	return result, nil
}

func (s *MemStore) CountNotes(userID int64, topicID int64) (int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	count := 0
	for _, id := range s.userNotes[userID] {
		note := s.notes[id]
		if note != nil && !note.Archived {
			if topicID == 0 || note.TopicID == topicID {
				count++
			}
		}
	}
	return count, nil
}

func (s *MemStore) Get(userID int64, noteID int64) (*Note, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	note, ok := s.notes[noteID]
	if !ok || note.UserID != userID {
		return nil, fmt.Errorf("заметка #%d не найдена", noteID)
	}
	return note, nil
}

func (s *MemStore) Edit(userID int64, noteID int64, text string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	note, ok := s.notes[noteID]
	if !ok || note.UserID != userID {
		return fmt.Errorf("заметка #%d не найдена", noteID)
	}
	note.Text = text
	return nil
}

func (s *MemStore) Delete(userID int64, noteID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	note, ok := s.notes[noteID]
	if !ok || note.UserID != userID {
		return fmt.Errorf("заметка #%d не найдена", noteID)
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

func (s *MemStore) Archive(userID int64, noteID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	note, ok := s.notes[noteID]
	if !ok || note.UserID != userID {
		return fmt.Errorf("заметка #%d не найдена", noteID)
	}
	note.Archived = true
	return nil
}

func (s *MemStore) Unarchive(userID int64, noteID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	note, ok := s.notes[noteID]
	if !ok || note.UserID != userID {
		return fmt.Errorf("заметка #%d не найдена", noteID)
	}
	note.Archived = false
	return nil
}

func (s *MemStore) ListArchived(userID int64) ([]Note, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := s.userNotes[userID]
	result := make([]Note, 0, len(ids))
	for _, id := range ids {
		note := s.notes[id]
		if note != nil && note.Archived {
			result = append(result, *note)
		}
	}
	return result, nil
}

func (s *MemStore) CountArchived(userID int64) (int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	count := 0
	for _, id := range s.userNotes[userID] {
		note := s.notes[id]
		if note != nil && note.Archived {
			count++
		}
	}
	return count, nil
}
