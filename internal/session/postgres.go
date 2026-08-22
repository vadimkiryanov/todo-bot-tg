package session

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	errs "todo-bot-tg/internal/errors"
)

// PostgresStore — реализация хранилища сессий на PostgreSQL (таблица web_sessions).
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore создаёт хранилище сессий на том же пуле, что и основной репозиторий.
// Таблица web_sessions создаётся общей миграцией схемы (repository/todo).
func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{pool: pool}
}

// Create сохраняет сессию.
func (s *PostgresStore) Create(sess Session) error {
	_, err := s.pool.Exec(context.Background(),
		`INSERT INTO web_sessions (token_hash, user_id, created_at, expires_at)
		 VALUES (@hash, @user, @created, @expires)`,
		pgx.NamedArgs{
			"hash":    sess.TokenHash,
			"user":    sess.UserID,
			"created": sess.CreatedAt,
			"expires": sess.ExpiresAt,
		},
	)
	if err != nil {
		return fmt.Errorf("сохранение сессии: %w", err)
	}
	return nil
}

// Get возвращает сессию по хешу токена. Истёкшая сессия удаляется и
// возвращается ErrSessionExpired.
func (s *PostgresStore) Get(tokenHash string) (Session, error) {
	ctx := context.Background()
	rows, err := s.pool.Query(ctx,
		`SELECT token_hash, user_id, created_at, expires_at FROM web_sessions WHERE token_hash = @hash`,
		pgx.NamedArgs{"hash": tokenHash},
	)
	if err != nil {
		return Session{}, fmt.Errorf("чтение сессии: %w", err)
	}
	sess, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[Session])
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, errs.ErrSessionNotFound
	}
	if err != nil {
		return Session{}, fmt.Errorf("чтение сессии: %w", err)
	}
	if sess.Expired() {
		_, _ = s.pool.Exec(ctx,
			`DELETE FROM web_sessions WHERE token_hash = @hash`,
			pgx.NamedArgs{"hash": tokenHash},
		)
		return Session{}, errs.ErrSessionExpired
	}
	return sess, nil
}

// Delete удаляет сессию. Отсутствующая сессия — не ошибка (идемпотентный logout).
func (s *PostgresStore) Delete(tokenHash string) error {
	_, err := s.pool.Exec(context.Background(),
		`DELETE FROM web_sessions WHERE token_hash = @hash`,
		pgx.NamedArgs{"hash": tokenHash},
	)
	if err != nil {
		return fmt.Errorf("удаление сессии: %w", err)
	}
	return nil
}
