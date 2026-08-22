package session

import (
	"sync"

	errs "todo-bot-tg/internal/errors"
)

// MemoryStore — in-memory реализация хранилища сессий (для dev без БД).
type MemoryStore struct {
	mu       sync.RWMutex
	sessions map[string]Session // tokenHash → сессия
}

// NewMemoryStore создаёт in-memory хранилище сессий.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{sessions: make(map[string]Session)}
}

// Create сохраняет сессию.
func (s *MemoryStore) Create(sess Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[sess.TokenHash] = sess
	return nil
}

// Get возвращает сессию по хешу токена. Истёкшая сессия удаляется и
// возвращается ErrSessionExpired.
func (s *MemoryStore) Get(tokenHash string) (Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	sess, exists := s.sessions[tokenHash]
	if !exists {
		return Session{}, errs.ErrSessionNotFound
	}
	if sess.Expired() {
		delete(s.sessions, tokenHash)
		return Session{}, errs.ErrSessionExpired
	}
	return sess, nil
}

// Delete удаляет сессию. Отсутствующая сессия — не ошибка (идемпотентный logout).
func (s *MemoryStore) Delete(tokenHash string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, tokenHash)
	return nil
}
