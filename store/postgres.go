package store

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
)

const schema = `
CREATE TABLE IF NOT EXISTS topics (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    topic_id BIGINT NOT NULL DEFAULT 0,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_notes_user_topic ON notes(user_id, topic_id);
`

// PostgresStore — реализация Store на PostgreSQL.
type PostgresStore struct {
	db *sql.DB
}

// NewPostgresStore создаёт подключение к PostgreSQL и применяет схему.
func NewPostgresStore(dsn string) (*PostgresStore, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("подключение к PostgreSQL: %w", err)
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping PostgreSQL: %w", err)
	}

	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("миграция схемы: %w", err)
	}

	return &PostgresStore{db: db}, nil
}

// Close закрывает соединение с БД.
func (s *PostgresStore) Close() error {
	return s.db.Close()
}

// --- Topics ---

func (s *PostgresStore) CreateTopic(userID int64, name string) (*Topic, error) {
	var t Topic
	err := s.db.QueryRow(
		`INSERT INTO topics (user_id, name) VALUES ($1, $2)
		 ON CONFLICT (user_id, name) DO NOTHING
		 RETURNING id, user_id, name`,
		userID, name,
	).Scan(&t.ID, &t.UserID, &t.Name)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("топик «%s» уже существует", name)
	}
	if err != nil {
		return nil, fmt.Errorf("создание топика: %w", err)
	}
	return &t, nil
}

func (s *PostgresStore) ListTopics(userID int64) ([]Topic, error) {
	rows, err := s.db.Query(
		`SELECT id, user_id, name FROM topics WHERE user_id = $1 ORDER BY id`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("список топиков: %w", err)
	}
	defer rows.Close()

	var result []Topic
	for rows.Next() {
		var t Topic
		if err := rows.Scan(&t.ID, &t.UserID, &t.Name); err != nil {
			return nil, fmt.Errorf("чтение топика: %w", err)
		}
		result = append(result, t)
	}
	return result, rows.Err()
}

func (s *PostgresStore) GetTopic(userID int64, topicID int64) (*Topic, error) {
	var t Topic
	err := s.db.QueryRow(
		`SELECT id, user_id, name FROM topics WHERE id = $1 AND user_id = $2`,
		topicID, userID,
	).Scan(&t.ID, &t.UserID, &t.Name)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("топик #%d не найден", topicID)
	}
	if err != nil {
		return nil, fmt.Errorf("поиск топика: %w", err)
	}
	return &t, nil
}

func (s *PostgresStore) DeleteTopic(userID int64, topicID int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("начало транзакции: %w", err)
	}
	defer tx.Rollback()

	// Удаляем заметки в топике
	if _, err := tx.Exec(
		`DELETE FROM notes WHERE user_id = $1 AND topic_id = $2`, userID, topicID,
	); err != nil {
		return fmt.Errorf("удаление заметок топика: %w", err)
	}

	// Удаляем сам топик
	res, err := tx.Exec(
		`DELETE FROM topics WHERE id = $1 AND user_id = $2`, topicID, userID,
	)
	if err != nil {
		return fmt.Errorf("удаление топика: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return fmt.Errorf("топик #%d не найден", topicID)
	}

	return tx.Commit()
}

// --- Notes ---

func (s *PostgresStore) Add(userID int64, topicID int64, text string) (*Note, error) {
	var note Note
	err := s.db.QueryRow(
		`INSERT INTO notes (user_id, topic_id, text) VALUES ($1, $2, $3)
		 RETURNING id, user_id, topic_id, text, created_at, archived`,
		userID, topicID, text,
	).Scan(&note.ID, &note.UserID, &note.TopicID, &note.Text, &note.CreatedAt, &note.Archived)
	if err != nil {
		return nil, fmt.Errorf("добавление заметки: %w", err)
	}
	return &note, nil
}

func (s *PostgresStore) List(userID int64, topicID int64) ([]Note, error) {
	var rows *sql.Rows
	var err error

	if topicID == 0 {
		rows, err = s.db.Query(
			`SELECT id, user_id, topic_id, text, created_at, archived
			 FROM notes WHERE user_id = $1 AND archived = FALSE
			 ORDER BY id DESC`, userID,
		)
	} else {
		rows, err = s.db.Query(
			`SELECT id, user_id, topic_id, text, created_at, archived
			 FROM notes WHERE user_id = $1 AND topic_id = $2 AND archived = FALSE
			 ORDER BY id DESC`, userID, topicID,
		)
	}
	if err != nil {
		return nil, fmt.Errorf("список заметок: %w", err)
	}
	defer rows.Close()

	var result []Note
	for rows.Next() {
		var n Note
		if err := rows.Scan(&n.ID, &n.UserID, &n.TopicID, &n.Text, &n.CreatedAt, &n.Archived); err != nil {
			return nil, fmt.Errorf("чтение заметки: %w", err)
		}
		result = append(result, n)
	}
	return result, rows.Err()
}

func (s *PostgresStore) Get(userID int64, noteID int64) (*Note, error) {
	var n Note
	err := s.db.QueryRow(
		`SELECT id, user_id, topic_id, text, created_at, archived
		 FROM notes WHERE id = $1 AND user_id = $2`,
		noteID, userID,
	).Scan(&n.ID, &n.UserID, &n.TopicID, &n.Text, &n.CreatedAt, &n.Archived)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("заметка #%d не найдена", noteID)
	}
	if err != nil {
		return nil, fmt.Errorf("поиск заметки: %w", err)
	}
	return &n, nil
}

func (s *PostgresStore) Edit(userID int64, noteID int64, text string) error {
	res, err := s.db.Exec(
		`UPDATE notes SET text = $1 WHERE id = $2 AND user_id = $3`,
		text, noteID, userID,
	)
	if err != nil {
		return fmt.Errorf("обновление заметки: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return fmt.Errorf("заметка #%d не найдена", noteID)
	}
	return nil
}

func (s *PostgresStore) Delete(userID int64, noteID int64) error {
	res, err := s.db.Exec(
		`DELETE FROM notes WHERE id = $1 AND user_id = $2`,
		noteID, userID,
	)
	if err != nil {
		return fmt.Errorf("удаление заметки: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return fmt.Errorf("заметка #%d не найдена", noteID)
	}
	return nil
}

func (s *PostgresStore) Archive(userID int64, noteID int64) error {
	res, err := s.db.Exec(
		`UPDATE notes SET archived = TRUE WHERE id = $1 AND user_id = $2`,
		noteID, userID,
	)
	if err != nil {
		return fmt.Errorf("архивация заметки: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return fmt.Errorf("заметка #%d не найдена", noteID)
	}
	return nil
}

func (s *PostgresStore) CountNotes(userID int64, topicID int64) (int, error) {
	var count int
	var err error

	if topicID == 0 {
		err = s.db.QueryRow(
			`SELECT COUNT(*) FROM notes WHERE user_id = $1 AND archived = FALSE`,
			userID,
		).Scan(&count)
	} else {
		err = s.db.QueryRow(
			`SELECT COUNT(*) FROM notes WHERE user_id = $1 AND topic_id = $2 AND archived = FALSE`,
			userID, topicID,
		).Scan(&count)
	}
	if err != nil {
		return 0, fmt.Errorf("подсчёт заметок: %w", err)
	}
	return count, nil
}

// compile-time check: PostgresStore implements Store
var _ Store = (*PostgresStore)(nil)
