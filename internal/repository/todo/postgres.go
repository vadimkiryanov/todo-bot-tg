package todo

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"

	"todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/model"
	"todo-bot-tg/internal/repository/todo/entity"
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
    folder_id BIGINT,
    text TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    reminder_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS folders (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    topic_id BIGINT NOT NULL,
    parent_folder_id BIGINT,
    name TEXT NOT NULL
);

ALTER TABLE notes ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS folder_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_notes_user_topic ON notes(user_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_folder ON notes(user_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_user_topic ON folders(user_id, topic_id);
`

// PostgresStore — реализация репозитория на PostgreSQL.
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

func (s *PostgresStore) CreateTopic(userID int64, name string) (model.Topic, error) {
	var t entity.TopicRecord
	err := s.db.QueryRow(
		`INSERT INTO topics (user_id, name) VALUES ($1, $2)
		 ON CONFLICT (user_id, name) DO NOTHING
		 RETURNING id, user_id, name`,
		userID, name,
	).Scan(&t.ID, &t.UserID, &t.Name)
	if err == sql.ErrNoRows {
		return model.Topic{}, errors.ErrTopicAlreadyExists
	}
	if err != nil {
		return model.Topic{}, fmt.Errorf("создание топика: %w", err)
	}
	return entity.TopicFromRecord(t), nil
}

func (s *PostgresStore) ListTopics(userID int64) ([]model.Topic, error) {
	rows, err := s.db.Query(
		`SELECT id, user_id, name FROM topics WHERE user_id = $1 ORDER BY id`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("список топиков: %w", err)
	}
	defer rows.Close()

	var result []model.Topic
	for rows.Next() {
		var t entity.TopicRecord
		if err := rows.Scan(&t.ID, &t.UserID, &t.Name); err != nil {
			return nil, fmt.Errorf("чтение топика: %w", err)
		}
		result = append(result, entity.TopicFromRecord(t))
	}
	return result, rows.Err()
}

func (s *PostgresStore) GetTopic(userID, topicID int64) (model.Topic, error) {
	var t entity.TopicRecord
	err := s.db.QueryRow(
		`SELECT id, user_id, name FROM topics WHERE id = $1 AND user_id = $2`,
		topicID, userID,
	).Scan(&t.ID, &t.UserID, &t.Name)
	if err == sql.ErrNoRows {
		return model.Topic{}, errors.ErrTopicNotFound
	}
	if err != nil {
		return model.Topic{}, fmt.Errorf("поиск топика: %w", err)
	}
	return entity.TopicFromRecord(t), nil
}

func (s *PostgresStore) DeleteTopic(userID, topicID int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("начало транзакции: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		`DELETE FROM notes WHERE user_id = $1 AND topic_id = $2`, userID, topicID,
	); err != nil {
		return fmt.Errorf("удаление заметок топика: %w", err)
	}

	res, err := tx.Exec(
		`DELETE FROM topics WHERE id = $1 AND user_id = $2`, topicID, userID,
	)
	if err != nil {
		return fmt.Errorf("удаление топика: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return errors.ErrTopicNotFound
	}

	return tx.Commit()
}

// --- Notes ---

func (s *PostgresStore) CreateNote(note model.Note) (model.Note, error) {
	rec := entity.NoteToRecord(note)
	err := s.db.QueryRow(
		`INSERT INTO notes (user_id, topic_id, folder_id, text, priority, reminder_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, user_id, topic_id, folder_id, text, priority, reminder_at, created_at, archived`,
		rec.UserID, rec.TopicID, rec.FolderID, rec.Text, rec.Priority, rec.ReminderAt, rec.CreatedAt,
	).Scan(&rec.ID, &rec.UserID, &rec.TopicID, &rec.FolderID, &rec.Text, &rec.Priority, &rec.ReminderAt, &rec.CreatedAt, &rec.Archived)
	if err != nil {
		return model.Note{}, fmt.Errorf("добавление заметки: %w", err)
	}
	return entity.NoteFromRecord(rec), nil
}

func (s *PostgresStore) ListNotes(userID, topicID int64, folderID *int64) ([]model.Note, error) {
	var rows *sql.Rows
	var err error

	switch {
	case folderID != nil:
		rows, err = s.db.Query(
			`SELECT id, user_id, topic_id, folder_id, text, priority, reminder_at, created_at, archived
			 FROM notes WHERE user_id = $1 AND folder_id = $2 AND archived = FALSE
			 ORDER BY id DESC`, userID, *folderID,
		)
	case topicID != 0:
		rows, err = s.db.Query(
			`SELECT id, user_id, topic_id, folder_id, text, priority, reminder_at, created_at, archived
			 FROM notes WHERE user_id = $1 AND topic_id = $2 AND folder_id IS NULL AND archived = FALSE
			 ORDER BY id DESC`, userID, topicID,
		)
	default:
		rows, err = s.db.Query(
			`SELECT id, user_id, topic_id, folder_id, text, priority, reminder_at, created_at, archived
			 FROM notes WHERE user_id = $1 AND archived = FALSE
			 ORDER BY id DESC`, userID,
		)
	}
	if err != nil {
		return nil, fmt.Errorf("список заметок: %w", err)
	}
	defer rows.Close()

	var result []model.Note
	for rows.Next() {
		var n entity.NoteRecord
		if err := rows.Scan(&n.ID, &n.UserID, &n.TopicID, &n.FolderID, &n.Text, &n.Priority, &n.ReminderAt, &n.CreatedAt, &n.Archived); err != nil {
			return nil, fmt.Errorf("чтение заметки: %w", err)
		}
		result = append(result, entity.NoteFromRecord(n))
	}
	return result, rows.Err()
}

func (s *PostgresStore) GetNote(userID, noteID int64) (model.Note, error) {
	var n entity.NoteRecord
	err := s.db.QueryRow(
		`SELECT id, user_id, topic_id, folder_id, text, priority, reminder_at, created_at, archived
		 FROM notes WHERE id = $1 AND user_id = $2`,
		noteID, userID,
	).Scan(&n.ID, &n.UserID, &n.TopicID, &n.FolderID, &n.Text, &n.Priority, &n.ReminderAt, &n.CreatedAt, &n.Archived)
	if err == sql.ErrNoRows {
		return model.Note{}, errors.ErrNoteNotFound
	}
	if err != nil {
		return model.Note{}, fmt.Errorf("поиск заметки: %w", err)
	}
	return entity.NoteFromRecord(n), nil
}

func (s *PostgresStore) GetNoteByID(noteID int64) (model.Note, error) {
	var n entity.NoteRecord
	err := s.db.QueryRow(
		`SELECT id, user_id, topic_id, folder_id, text, priority, reminder_at, created_at, archived
		 FROM notes WHERE id = $1`,
		noteID,
	).Scan(&n.ID, &n.UserID, &n.TopicID, &n.FolderID, &n.Text, &n.Priority, &n.ReminderAt, &n.CreatedAt, &n.Archived)
	if err == sql.ErrNoRows {
		return model.Note{}, errors.ErrNoteNotFound
	}
	if err != nil {
		return model.Note{}, fmt.Errorf("поиск заметки: %w", err)
	}
	return entity.NoteFromRecord(n), nil
}

func (s *PostgresStore) UpdateNote(note model.Note) error {
	rec := entity.NoteToRecord(note)
	res, err := s.db.Exec(
		`UPDATE notes SET text = $1, priority = $2, reminder_at = $3, archived = $4 WHERE id = $5 AND user_id = $6`,
		rec.Text, rec.Priority, rec.ReminderAt, rec.Archived, rec.ID, rec.UserID,
	)
	if err != nil {
		return fmt.Errorf("обновление заметки: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return errors.ErrNoteNotFound
	}
	return nil
}

func (s *PostgresStore) DeleteNote(userID, noteID int64) error {
	res, err := s.db.Exec(
		`DELETE FROM notes WHERE id = $1 AND user_id = $2`,
		noteID, userID,
	)
	if err != nil {
		return fmt.Errorf("удаление заметки: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return errors.ErrNoteNotFound
	}
	return nil
}

func (s *PostgresStore) CountNotes(userID, topicID int64, folderID *int64) (int, error) {
	var count int
	var err error

	switch {
	case folderID != nil:
		err = s.db.QueryRow(
			`SELECT COUNT(*) FROM notes WHERE user_id = $1 AND folder_id = $2 AND archived = FALSE`,
			userID, *folderID,
		).Scan(&count)
	case topicID != 0:
		err = s.db.QueryRow(
			`SELECT COUNT(*) FROM notes WHERE user_id = $1 AND topic_id = $2 AND folder_id IS NULL AND archived = FALSE`,
			userID, topicID,
		).Scan(&count)
	default:
		err = s.db.QueryRow(
			`SELECT COUNT(*) FROM notes WHERE user_id = $1 AND archived = FALSE`,
			userID,
		).Scan(&count)
	}
	if err != nil {
		return 0, fmt.Errorf("подсчёт заметок: %w", err)
	}
	return count, nil
}

func (s *PostgresStore) ListArchived(userID int64) ([]model.Note, error) {
	rows, err := s.db.Query(
		`SELECT id, user_id, topic_id, folder_id, text, priority, reminder_at, created_at, archived
		 FROM notes WHERE user_id = $1 AND archived = TRUE
		 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("чтение архива: %w", err)
	}
	defer rows.Close()

	var result []model.Note
	for rows.Next() {
		var n entity.NoteRecord
		if err := rows.Scan(&n.ID, &n.UserID, &n.TopicID, &n.FolderID, &n.Text, &n.Priority, &n.ReminderAt, &n.CreatedAt, &n.Archived); err != nil {
			return nil, fmt.Errorf("чтение заметки: %w", err)
		}
		result = append(result, entity.NoteFromRecord(n))
	}
	return result, rows.Err()
}

func (s *PostgresStore) CountArchived(userID int64) (int, error) {
	var count int
	err := s.db.QueryRow(
		`SELECT COUNT(*) FROM notes WHERE user_id = $1 AND archived = TRUE`,
		userID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("подсчёт архива: %w", err)
	}
	return count, nil
}

// GetPendingReminders возвращает заметки с просроченными напоминаниями.
func (s *PostgresStore) GetPendingReminders() ([]model.Note, error) {
	rows, err := s.db.Query(
		`SELECT id, user_id, topic_id, folder_id, text, priority, reminder_at, created_at, archived
		 FROM notes WHERE reminder_at IS NOT NULL AND reminder_at <= NOW() AND archived = FALSE`,
	)
	if err != nil {
		return nil, fmt.Errorf("поиск просроченных напоминаний: %w", err)
	}
	defer rows.Close()

	var result []model.Note
	for rows.Next() {
		var n entity.NoteRecord
		if err := rows.Scan(&n.ID, &n.UserID, &n.TopicID, &n.FolderID, &n.Text, &n.Priority, &n.ReminderAt, &n.CreatedAt, &n.Archived); err != nil {
			return nil, fmt.Errorf("чтение заметки: %w", err)
		}
		result = append(result, entity.NoteFromRecord(n))
	}
	return result, rows.Err()
}

// HasAnyData возвращает true, если у пользователя уже есть данные.
func (s *PostgresStore) HasAnyData(userID int64) bool {
	var count int
	_ = s.db.QueryRow(
		`SELECT COUNT(*) FROM notes WHERE user_id = $1`, userID,
	).Scan(&count)
	return count > 0
}

// MoveNote перемещает заметку в другой топик и/или папку.
func (s *PostgresStore) MoveNote(userID, noteID int64, topicID int64, folderID *int64) error {
	res, err := s.db.Exec(
		`UPDATE notes SET topic_id = $1, folder_id = $2 WHERE id = $3 AND user_id = $4`,
		topicID, folderID, noteID, userID,
	)
	if err != nil {
		return fmt.Errorf("перемещение заметки: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return errors.ErrNoteNotFound
	}
	return nil
}

// --- Folders ---

func (s *PostgresStore) CreateFolder(folder model.Folder) (model.Folder, error) {
	// Проверяем дубликат на уровне приложения (NULL-safe)
	var exists int
	_ = s.db.QueryRow(
		`SELECT COUNT(*) FROM folders
		 WHERE user_id = $1 AND topic_id = $2 AND name = $3
		 AND parent_folder_id IS NOT DISTINCT FROM $4`,
		folder.UserID, folder.TopicID, folder.Name, folder.ParentFolderID,
	).Scan(&exists)
	if exists > 0 {
		return model.Folder{}, errors.ErrFolderAlreadyExists
	}

	f := entity.FolderToRecord(folder)
	err := s.db.QueryRow(
		`INSERT INTO folders (user_id, topic_id, parent_folder_id, name) VALUES ($1, $2, $3, $4)
		 RETURNING id, user_id, topic_id, parent_folder_id, name`,
		f.UserID, f.TopicID, f.ParentFolderID, f.Name,
	).Scan(&f.ID, &f.UserID, &f.TopicID, &f.ParentFolderID, &f.Name)
	if err != nil {
		return model.Folder{}, fmt.Errorf("создание папки: %w", err)
	}
	return entity.FolderFromRecord(f), nil
}

func (s *PostgresStore) ListFolders(userID, topicID int64, parentFolderID *int64) ([]model.Folder, error) {
	var rows *sql.Rows
	var err error

	if parentFolderID == nil {
		rows, err = s.db.Query(
			`SELECT id, user_id, topic_id, parent_folder_id, name
			 FROM folders WHERE user_id = $1 AND topic_id = $2 AND parent_folder_id IS NULL
			 ORDER BY id`, userID, topicID,
		)
	} else {
		rows, err = s.db.Query(
			`SELECT id, user_id, topic_id, parent_folder_id, name
			 FROM folders WHERE user_id = $1 AND topic_id = $2 AND parent_folder_id = $3
			 ORDER BY id`, userID, topicID, *parentFolderID,
		)
	}
	if err != nil {
		return nil, fmt.Errorf("список папок: %w", err)
	}
	defer rows.Close()

	var result []model.Folder
	for rows.Next() {
		var f entity.FolderRecord
		if err := rows.Scan(&f.ID, &f.UserID, &f.TopicID, &f.ParentFolderID, &f.Name); err != nil {
			return nil, fmt.Errorf("чтение папки: %w", err)
		}
		result = append(result, entity.FolderFromRecord(f))
	}
	return result, rows.Err()
}

func (s *PostgresStore) GetFolder(userID, folderID int64) (model.Folder, error) {
	var f entity.FolderRecord
	err := s.db.QueryRow(
		`SELECT id, user_id, topic_id, parent_folder_id, name
		 FROM folders WHERE id = $1 AND user_id = $2`,
		folderID, userID,
	).Scan(&f.ID, &f.UserID, &f.TopicID, &f.ParentFolderID, &f.Name)
	if err == sql.ErrNoRows {
		return model.Folder{}, errors.ErrFolderNotFound
	}
	if err != nil {
		return model.Folder{}, fmt.Errorf("поиск папки: %w", err)
	}
	return entity.FolderFromRecord(f), nil
}

func (s *PostgresStore) CountFolders(userID, topicID int64, parentFolderID *int64) (int, error) {
	var count int
	var err error

	if parentFolderID == nil {
		err = s.db.QueryRow(
			`SELECT COUNT(*) FROM folders WHERE user_id = $1 AND topic_id = $2 AND parent_folder_id IS NULL`,
			userID, topicID,
		).Scan(&count)
	} else {
		err = s.db.QueryRow(
			`SELECT COUNT(*) FROM folders WHERE user_id = $1 AND topic_id = $2 AND parent_folder_id = $3`,
			userID, topicID, *parentFolderID,
		).Scan(&count)
	}
	if err != nil {
		return 0, fmt.Errorf("подсчёт папок: %w", err)
	}
	return count, nil
}

func (s *PostgresStore) GetFolderChain(folderID int64) ([]model.Folder, error) {
	var chain []model.Folder
	currentID := &folderID
	visited := make(map[int64]bool)

	for currentID != nil {
		if visited[*currentID] {
			break
		}
		visited[*currentID] = true

		var f entity.FolderRecord
		err := s.db.QueryRow(
			`SELECT id, user_id, topic_id, parent_folder_id, name FROM folders WHERE id = $1`,
			*currentID,
		).Scan(&f.ID, &f.UserID, &f.TopicID, &f.ParentFolderID, &f.Name)
		if err != nil {
			break
		}
		chain = append([]model.Folder{entity.FolderFromRecord(f)}, chain...)
		currentID = f.ParentFolderID
	}
	return chain, nil
}
