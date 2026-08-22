package todo

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	errs "todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/repository/todo/entity"
	"todo-bot-tg/internal/user"
)

// --- Пользователи (MemStore) ---

// CreateUser создаёт веб-пользователя (логин + bcrypt-хеш пароля).
func (s *MemStore) CreateUser(u user.User) (user.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	username := strings.ToLower(u.Username)
	if _, exists := s.usernameIdx[username]; exists {
		return user.User{}, errs.ErrUsernameTaken
	}

	rec := entity.UserToRecord(u)
	rec.ID = s.nextUserID
	rec.Username = username
	s.users[rec.ID] = rec
	s.usernameIdx[username] = rec.ID
	s.nextUserID++
	return entity.UserFromRecord(rec), nil
}

// FindByUsername ищет веб-пользователя по логину (без учёта регистра).
func (s *MemStore) FindByUsername(username string) (user.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	id, exists := s.usernameIdx[strings.ToLower(username)]
	if !exists {
		return user.User{}, errs.ErrUserNotFound
	}
	return entity.UserFromRecord(s.users[id]), nil
}

// GetByID возвращает пользователя по ID.
func (s *MemStore) GetByID(id int64) (user.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rec, exists := s.users[id]
	if !exists {
		return user.User{}, errs.ErrUserNotFound
	}
	return entity.UserFromRecord(rec), nil
}

// FindOrCreateByTelegramID находит пользователя по telegram_id
// или создаёт его при первом обращении. Возвращает users.id.
func (s *MemStore) FindOrCreateByTelegramID(telegramID int64) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if id, exists := s.telegramIdx[telegramID]; exists {
		return id, nil
	}

	rec := entity.UserRecord{ID: s.nextUserID, TelegramID: &telegramID}
	s.users[rec.ID] = rec
	s.telegramIdx[telegramID] = rec.ID
	s.nextUserID++
	return rec.ID, nil
}

// --- Пользователи (PostgresStore) ---

// CreateUser создаёт веб-пользователя (логин + bcrypt-хеш пароля).
func (s *PostgresStore) CreateUser(u user.User) (user.User, error) {
	username := strings.ToLower(u.Username)
	rows, err := s.pool.Query(context.Background(),
		`INSERT INTO users (username, password_hash) VALUES (@username, @hash)
		 RETURNING id, username, password_hash, telegram_id`,
		pgx.NamedArgs{"username": username, "hash": u.PasswordHash},
	)
	if err != nil {
		if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "23505" {
			return user.User{}, errs.ErrUsernameTaken
		}
		return user.User{}, fmt.Errorf("создание пользователя: %w", err)
	}
	rec, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[entity.UserRecord])
	if err != nil {
		return user.User{}, fmt.Errorf("создание пользователя: %w", err)
	}
	return entity.UserFromRecord(rec), nil
}

// FindByUsername ищет веб-пользователя по логину (без учёта регистра).
func (s *PostgresStore) FindByUsername(username string) (user.User, error) {
	rows, err := s.pool.Query(context.Background(),
		`SELECT id, username, password_hash, telegram_id FROM users WHERE username = @username`,
		pgx.NamedArgs{"username": strings.ToLower(username)},
	)
	if err != nil {
		return user.User{}, fmt.Errorf("поиск пользователя: %w", err)
	}
	rec, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[entity.UserRecord])
	if errors.Is(err, pgx.ErrNoRows) {
		return user.User{}, errs.ErrUserNotFound
	}
	if err != nil {
		return user.User{}, fmt.Errorf("поиск пользователя: %w", err)
	}
	return entity.UserFromRecord(rec), nil
}

// GetByID возвращает пользователя по ID.
func (s *PostgresStore) GetByID(id int64) (user.User, error) {
	rows, err := s.pool.Query(context.Background(),
		`SELECT id, COALESCE(username, '') AS username, COALESCE(password_hash, '') AS password_hash, telegram_id
		 FROM users WHERE id = @id`,
		pgx.NamedArgs{"id": id},
	)
	if err != nil {
		return user.User{}, fmt.Errorf("поиск пользователя: %w", err)
	}
	rec, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[entity.UserRecord])
	if errors.Is(err, pgx.ErrNoRows) {
		return user.User{}, errs.ErrUserNotFound
	}
	if err != nil {
		return user.User{}, fmt.Errorf("поиск пользователя: %w", err)
	}
	return entity.UserFromRecord(rec), nil
}

// FindOrCreateByTelegramID находит пользователя по telegram_id
// или создаёт его при первом обращении. Возвращает users.id.
func (s *PostgresStore) FindOrCreateByTelegramID(telegramID int64) (int64, error) {
	ctx := context.Background()
	rows, err := s.pool.Query(ctx,
		`INSERT INTO users (telegram_id) VALUES (@tg) ON CONFLICT (telegram_id) DO NOTHING
		 RETURNING id, COALESCE(username, '') AS username, COALESCE(password_hash, '') AS password_hash, telegram_id`,
		pgx.NamedArgs{"tg": telegramID},
	)
	if err != nil {
		return 0, fmt.Errorf("создание пользователя из Telegram: %w", err)
	}
	rec, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[entity.UserRecord])
	if err == nil {
		return rec.ID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, fmt.Errorf("создание пользователя из Telegram: %w", err)
	}

	// Уже существует — вернуть id
	rows, err = s.pool.Query(ctx,
		`SELECT id, COALESCE(username, '') AS username, COALESCE(password_hash, '') AS password_hash, telegram_id
		 FROM users WHERE telegram_id = @tg`,
		pgx.NamedArgs{"tg": telegramID},
	)
	if err != nil {
		return 0, fmt.Errorf("поиск пользователя из Telegram: %w", err)
	}
	rec, err = pgx.CollectOneRow(rows, pgx.RowToStructByName[entity.UserRecord])
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, errs.ErrUserNotFound
	}
	if err != nil {
		return 0, fmt.Errorf("поиск пользователя из Telegram: %w", err)
	}
	return rec.ID, nil
}

// Pool возвращает пул соединений (для хранилища сессий).
func (s *PostgresStore) Pool() *pgxpool.Pool {
	return s.pool
}
