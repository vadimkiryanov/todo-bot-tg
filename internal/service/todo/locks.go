package todo

import "sync"

// userLocks — сериализация операций одного пользователя (keyed mutex).
// Глобальный мьютекс не нужен: атомарность отдельных операций обеспечивают
// репозитории (RWMutex в MemStore, транзакции/affected rows в PostgreSQL),
// а данные разных пользователей не пересекаются.
type userLocks struct {
	mu    sync.Mutex // защищает карту locks
	locks map[int64]*sync.Mutex
}

func newUserLocks() *userLocks {
	return &userLocks{locks: make(map[int64]*sync.Mutex)}
}

// Lock блокирует мьютекс пользователя userID и возвращает функцию разблокировки.
func (u *userLocks) Lock(userID int64) func() {
	u.mu.Lock()
	l, ok := u.locks[userID]
	if !ok {
		l = &sync.Mutex{}
		u.locks[userID] = l
	}
	u.mu.Unlock()
	l.Lock()
	return l.Unlock
}
