package todo

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	errs "todo-bot-tg/internal/errors"
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
    reminder_repeat TEXT NOT NULL DEFAULT 'once',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    pinned BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS folders (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    topic_id BIGINT NOT NULL,
    parent_folder_id BIGINT,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
    id SERIAL PRIMARY KEY,
    note_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    type TEXT NOT NULL,
    file_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL DEFAULT '',
    file_size BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
    user_id BIGINT PRIMARY KEY,
    show_counts BOOLEAN NOT NULL DEFAULT FALSE,
    breadcrumb_inline BOOLEAN NOT NULL DEFAULT FALSE,
    breadcrumb_bottom BOOLEAN NOT NULL DEFAULT FALSE,
    show_keyboard BOOLEAN NOT NULL DEFAULT FALSE,
    timezone_offset INTEGER NOT NULL DEFAULT 0,
    folders_collapsed BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE notes ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS reminder_repeat TEXT NOT NULL DEFAULT 'once';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS folder_id BIGINT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS done BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_notes_user_topic ON notes(user_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_folder ON notes(user_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_user_topic ON folders(user_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_attachments_note ON attachments(note_id);
CREATE INDEX IF NOT EXISTS idx_attachments_user ON attachments(user_id);
`

// PostgresStore — реализация репозитория на PostgreSQL (pgxpool).
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore создаёт пул соединений и применяет схему.
// Методы репозитория вызываются без ctx (интерфейс сервиса без контекста),
// поэтому внутри используется context.Background().
func NewPostgresStore(ctx context.Context, dsn string) (*PostgresStore, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("подключение к PostgreSQL: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping PostgreSQL: %w", err)
	}

	if _, err := pool.Exec(ctx, schema); err != nil {
		pool.Close()
		return nil, fmt.Errorf("миграция схемы: %w", err)
	}

	return &PostgresStore{pool: pool}, nil
}

// Close закрывает пул соединений.
func (s *PostgresStore) Close() {
	s.pool.Close()
}

// --- Topics ---

func (s *PostgresStore) CreateTopic(userID int64, name string) (model.Topic, error) {
	ctx := context.Background()
	rows, err := s.pool.Query(ctx,
		`INSERT INTO topics (user_id, name) VALUES (@user, @name)
		 ON CONFLICT (user_id, name) DO NOTHING
		 RETURNING id, user_id, name`,
		pgx.NamedArgs{"user": userID, "name": name},
	)
	if err != nil {
		return model.Topic{}, fmt.Errorf("создание топика: %w", err)
	}
	rec, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[entity.TopicRecord])
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Topic{}, errs.ErrTopicAlreadyExists
	}
	if err != nil {
		return model.Topic{}, fmt.Errorf("создание топика: %w", err)
	}
	return entity.TopicFromRecord(rec), nil
}

func (s *PostgresStore) ListTopics(userID int64) ([]model.Topic, error) {
	rows, err := s.pool.Query(context.Background(),
		`SELECT id, user_id, name FROM topics WHERE user_id = @user ORDER BY id`,
		pgx.NamedArgs{"user": userID},
	)
	if err != nil {
		return nil, fmt.Errorf("список топиков: %w", err)
	}
	recs, err := pgx.CollectRows(rows, pgx.RowToStructByName[entity.TopicRecord])
	if err != nil {
		return nil, fmt.Errorf("чтение топиков: %w", err)
	}
	result := make([]model.Topic, 0, len(recs))
	for _, r := range recs {
		result = append(result, entity.TopicFromRecord(r))
	}
	return result, nil
}

func (s *PostgresStore) GetTopic(userID, topicID int64) (model.Topic, error) {
	rows, err := s.pool.Query(context.Background(),
		`SELECT id, user_id, name FROM topics WHERE id = @id AND user_id = @user`,
		pgx.NamedArgs{"id": topicID, "user": userID},
	)
	if err != nil {
		return model.Topic{}, fmt.Errorf("поиск топика: %w", err)
	}
	rec, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[entity.TopicRecord])
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Topic{}, errs.ErrTopicNotFound
	}
	if err != nil {
		return model.Topic{}, fmt.Errorf("поиск топика: %w", err)
	}
	return entity.TopicFromRecord(rec), nil
}

func (s *PostgresStore) DeleteTopic(userID, topicID int64) error {
	ctx := context.Background()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("начало транзакции: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`DELETE FROM attachments WHERE user_id = @user AND note_id IN
		 (SELECT id FROM notes WHERE user_id = @user AND topic_id = @topic)`,
		pgx.NamedArgs{"user": userID, "topic": topicID},
	); err != nil {
		return fmt.Errorf("удаление вложений топика: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`DELETE FROM notes WHERE user_id = @user AND topic_id = @topic`,
		pgx.NamedArgs{"user": userID, "topic": topicID},
	); err != nil {
		return fmt.Errorf("удаление заметок топика: %w", err)
	}

	res, err := tx.Exec(ctx,
		`DELETE FROM topics WHERE id = @id AND user_id = @user`,
		pgx.NamedArgs{"id": topicID, "user": userID},
	)
	if err != nil {
		return fmt.Errorf("удаление топика: %w", err)
	}
	if res.RowsAffected() == 0 {
		return errs.ErrTopicNotFound
	}

	return tx.Commit(ctx)
}

// --- Notes ---

const noteColumns = `id, user_id, topic_id, folder_id, text, priority, reminder_at, reminder_repeat, created_at, archived, done, pinned`

func (s *PostgresStore) CreateNote(note model.Note) (model.Note, error) {
	rec := entity.NoteToRecord(note)
	rows, err := s.pool.Query(context.Background(),
		`INSERT INTO notes (user_id, topic_id, folder_id, text, priority, reminder_at, reminder_repeat, created_at, done, pinned)
		 VALUES (@user, @topic, @folder, @text, @priority, @reminder_at, @reminder_repeat, @created_at, @done, @pinned)
		 RETURNING `+noteColumns,
		pgx.NamedArgs{
			"user":            rec.UserID,
			"topic":           rec.TopicID,
			"folder":          rec.FolderID,
			"text":            rec.Text,
			"priority":        rec.Priority,
			"reminder_at":     rec.ReminderAt,
			"reminder_repeat": rec.ReminderRepeat,
			"created_at":      rec.CreatedAt,
			"done":            rec.Done,
			"pinned":          rec.Pinned,
		},
	)
	if err != nil {
		return model.Note{}, fmt.Errorf("добавление заметки: %w", err)
	}
	created, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[entity.NoteRecord])
	if err != nil {
		return model.Note{}, fmt.Errorf("добавление заметки: %w", err)
	}
	return entity.NoteFromRecord(created), nil
}

func (s *PostgresStore) ListNotes(userID, topicID int64, folderID *int64) ([]model.Note, error) {
	where := "user_id = @user AND archived = FALSE"
	args := pgx.NamedArgs{"user": userID}
	switch {
	case folderID != nil:
		where += " AND folder_id = @folder"
		args["folder"] = *folderID
	case topicID != 0:
		where += " AND topic_id = @topic AND folder_id IS NULL"
		args["topic"] = topicID
	}

	rows, err := s.pool.Query(context.Background(),
		`SELECT `+noteColumns+` FROM notes WHERE `+where+` ORDER BY id DESC`, args,
	)
	if err != nil {
		return nil, fmt.Errorf("список заметок: %w", err)
	}
	recs, err := pgx.CollectRows(rows, pgx.RowToStructByName[entity.NoteRecord])
	if err != nil {
		return nil, fmt.Errorf("чтение заметок: %w", err)
	}
	result := make([]model.Note, 0, len(recs))
	for _, r := range recs {
		result = append(result, entity.NoteFromRecord(r))
	}
	return result, nil
}

func (s *PostgresStore) GetNote(userID, noteID int64) (model.Note, error) {
	rows, err := s.pool.Query(context.Background(),
		`SELECT `+noteColumns+` FROM notes WHERE id = @id AND user_id = @user`,
		pgx.NamedArgs{"id": noteID, "user": userID},
	)
	if err != nil {
		return model.Note{}, fmt.Errorf("поиск заметки: %w", err)
	}
	rec, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[entity.NoteRecord])
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Note{}, errs.ErrNoteNotFound
	}
	if err != nil {
		return model.Note{}, fmt.Errorf("поиск заметки: %w", err)
	}
	return entity.NoteFromRecord(rec), nil
}

func (s *PostgresStore) UpdateNote(note model.Note) error {
	rec := entity.NoteToRecord(note)
	res, err := s.pool.Exec(context.Background(),
		`UPDATE notes SET text = @text, priority = @priority, reminder_at = @reminder_at,
		 reminder_repeat = @reminder_repeat, archived = @archived, done = @done, pinned = @pinned
		 WHERE id = @id AND user_id = @user`,
		pgx.NamedArgs{
			"text":            rec.Text,
			"priority":        rec.Priority,
			"reminder_at":     rec.ReminderAt,
			"reminder_repeat": rec.ReminderRepeat,
			"archived":        rec.Archived,
			"done":            rec.Done,
			"pinned":          rec.Pinned,
			"id":              rec.ID,
			"user":            rec.UserID,
		},
	)
	if err != nil {
		return fmt.Errorf("обновление заметки: %w", err)
	}
	if res.RowsAffected() == 0 {
		return errs.ErrNoteNotFound
	}
	return nil
}

func (s *PostgresStore) DeleteNote(userID, noteID int64) error {
	ctx := context.Background()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("начало транзакции: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`DELETE FROM attachments WHERE note_id = @id AND user_id = @user`,
		pgx.NamedArgs{"id": noteID, "user": userID},
	); err != nil {
		return fmt.Errorf("удаление вложений заметки: %w", err)
	}

	res, err := tx.Exec(ctx,
		`DELETE FROM notes WHERE id = @id AND user_id = @user`,
		pgx.NamedArgs{"id": noteID, "user": userID},
	)
	if err != nil {
		return fmt.Errorf("удаление заметки: %w", err)
	}
	if res.RowsAffected() == 0 {
		return errs.ErrNoteNotFound
	}
	return tx.Commit(ctx)
}

// CountDoneNotes возвращает количество выполненных заметок в топике/папке.
func (s *PostgresStore) CountDoneNotes(userID, topicID int64, folderID *int64) (int, error) {
	where := "user_id = @user AND done = TRUE AND archived = FALSE"
	args := pgx.NamedArgs{"user": userID}
	switch {
	case topicID != 0 && folderID != nil:
		where += " AND topic_id = @topic AND folder_id = @folder"
		args["topic"], args["folder"] = topicID, *folderID
	case topicID != 0:
		where += " AND topic_id = @topic AND folder_id IS NULL"
		args["topic"] = topicID
	case folderID != nil:
		where += " AND folder_id = @folder"
		args["folder"] = *folderID
	default:
		where += " AND folder_id IS NULL"
	}

	var count int
	err := s.pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM notes WHERE `+where, args).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("подсчёт выполненных заметок: %w", err)
	}
	return count, nil
}

func (s *PostgresStore) CountNotes(userID, topicID int64, folderID *int64) (int, error) {
	where := "user_id = @user AND archived = FALSE"
	args := pgx.NamedArgs{"user": userID}
	switch {
	case folderID != nil:
		where += " AND folder_id = @folder"
		args["folder"] = *folderID
	case topicID != 0:
		where += " AND topic_id = @topic AND folder_id IS NULL"
		args["topic"] = topicID
	}

	var count int
	err := s.pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM notes WHERE `+where, args).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("подсчёт заметок: %w", err)
	}
	return count, nil
}

func (s *PostgresStore) ListArchived(userID int64) ([]model.Note, error) {
	rows, err := s.pool.Query(context.Background(),
		`SELECT `+noteColumns+` FROM notes WHERE user_id = @user AND archived = TRUE
		 ORDER BY created_at DESC`,
		pgx.NamedArgs{"user": userID},
	)
	if err != nil {
		return nil, fmt.Errorf("чтение архива: %w", err)
	}
	recs, err := pgx.CollectRows(rows, pgx.RowToStructByName[entity.NoteRecord])
	if err != nil {
		return nil, fmt.Errorf("чтение архива: %w", err)
	}
	result := make([]model.Note, 0, len(recs))
	for _, r := range recs {
		result = append(result, entity.NoteFromRecord(r))
	}
	return result, nil
}

func (s *PostgresStore) CountArchived(userID int64) (int, error) {
	var count int
	err := s.pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM notes WHERE user_id = @user AND archived = TRUE`,
		pgx.NamedArgs{"user": userID},
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("подсчёт архива: %w", err)
	}
	return count, nil
}

// GetPendingReminders возвращает заметки с просроченными напоминаниями.
func (s *PostgresStore) GetPendingReminders() ([]model.Note, error) {
	rows, err := s.pool.Query(context.Background(),
		`SELECT `+noteColumns+` FROM notes
		 WHERE reminder_at IS NOT NULL AND reminder_at <= NOW() AND archived = FALSE`,
	)
	if err != nil {
		return nil, fmt.Errorf("поиск просроченных напоминаний: %w", err)
	}
	recs, err := pgx.CollectRows(rows, pgx.RowToStructByName[entity.NoteRecord])
	if err != nil {
		return nil, fmt.Errorf("чтение напоминаний: %w", err)
	}
	result := make([]model.Note, 0, len(recs))
	for _, r := range recs {
		result = append(result, entity.NoteFromRecord(r))
	}
	return result, nil
}

// HasAnyData возвращает true, если у пользователя уже есть данные.
func (s *PostgresStore) HasAnyData(userID int64) bool {
	var count int
	_ = s.pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM notes WHERE user_id = @user`,
		pgx.NamedArgs{"user": userID},
	).Scan(&count)
	return count > 0
}

// MoveNote перемещает заметку в другой топик и/или папку.
func (s *PostgresStore) MoveNote(userID, noteID int64, topicID int64, folderID *int64) error {
	res, err := s.pool.Exec(context.Background(),
		`UPDATE notes SET topic_id = @topic, folder_id = @folder WHERE id = @id AND user_id = @user`,
		pgx.NamedArgs{
			"topic":  topicID,
			"folder": folderID,
			"id":     noteID,
			"user":   userID,
		},
	)
	if err != nil {
		return fmt.Errorf("перемещение заметки: %w", err)
	}
	if res.RowsAffected() == 0 {
		return errs.ErrNoteNotFound
	}
	return nil
}

// --- Folders ---

func (s *PostgresStore) CreateFolder(folder model.Folder) (model.Folder, error) {
	ctx := context.Background()
	// Проверяем дубликат на уровне приложения (NULL-safe)
	var exists int
	_ = s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM folders
		 WHERE user_id = @user AND topic_id = @topic AND name = @name
		 AND parent_folder_id IS NOT DISTINCT FROM @parent`,
		pgx.NamedArgs{
			"user":   folder.UserID,
			"topic":  folder.TopicID,
			"name":   folder.Name,
			"parent": folder.ParentFolderID,
		},
	).Scan(&exists)
	if exists > 0 {
		return model.Folder{}, errs.ErrFolderAlreadyExists
	}

	f := entity.FolderToRecord(folder)
	rows, err := s.pool.Query(ctx,
		`INSERT INTO folders (user_id, topic_id, parent_folder_id, name) VALUES (@user, @topic, @parent, @name)
		 RETURNING id, user_id, topic_id, parent_folder_id, name`,
		pgx.NamedArgs{
			"user":   f.UserID,
			"topic":  f.TopicID,
			"parent": f.ParentFolderID,
			"name":   f.Name,
		},
	)
	if err != nil {
		return model.Folder{}, fmt.Errorf("создание папки: %w", err)
	}
	rec, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[entity.FolderRecord])
	if err != nil {
		return model.Folder{}, fmt.Errorf("создание папки: %w", err)
	}
	return entity.FolderFromRecord(rec), nil
}

func (s *PostgresStore) ListFolders(userID, topicID int64, parentFolderID *int64) ([]model.Folder, error) {
	where := "user_id = @user AND topic_id = @topic"
	args := pgx.NamedArgs{"user": userID, "topic": topicID}
	if parentFolderID == nil {
		where += " AND parent_folder_id IS NULL"
	} else {
		where += " AND parent_folder_id = @parent"
		args["parent"] = *parentFolderID
	}

	rows, err := s.pool.Query(context.Background(),
		`SELECT id, user_id, topic_id, parent_folder_id, name FROM folders WHERE `+where+` ORDER BY id`,
		args,
	)
	if err != nil {
		return nil, fmt.Errorf("список папок: %w", err)
	}
	recs, err := pgx.CollectRows(rows, pgx.RowToStructByName[entity.FolderRecord])
	if err != nil {
		return nil, fmt.Errorf("чтение папок: %w", err)
	}
	result := make([]model.Folder, 0, len(recs))
	for _, r := range recs {
		result = append(result, entity.FolderFromRecord(r))
	}
	return result, nil
}

func (s *PostgresStore) GetFolder(userID, folderID int64) (model.Folder, error) {
	rows, err := s.pool.Query(context.Background(),
		`SELECT id, user_id, topic_id, parent_folder_id, name FROM folders WHERE id = @id AND user_id = @user`,
		pgx.NamedArgs{"id": folderID, "user": userID},
	)
	if err != nil {
		return model.Folder{}, fmt.Errorf("поиск папки: %w", err)
	}
	rec, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[entity.FolderRecord])
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Folder{}, errs.ErrFolderNotFound
	}
	if err != nil {
		return model.Folder{}, fmt.Errorf("поиск папки: %w", err)
	}
	return entity.FolderFromRecord(rec), nil
}

func (s *PostgresStore) CountFolders(userID, topicID int64, parentFolderID *int64) (int, error) {
	where := "user_id = @user AND topic_id = @topic"
	args := pgx.NamedArgs{"user": userID, "topic": topicID}
	if parentFolderID == nil {
		where += " AND parent_folder_id IS NULL"
	} else {
		where += " AND parent_folder_id = @parent"
		args["parent"] = *parentFolderID
	}

	var count int
	err := s.pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM folders WHERE `+where, args).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("подсчёт папок: %w", err)
	}
	return count, nil
}

// GetFolderChain возвращает цепочку папок от заданной к корню (внутренняя → внешняя).
func (s *PostgresStore) GetFolderChain(folderID int64) ([]model.Folder, error) {
	ctx := context.Background()
	var chain []model.Folder
	currentID := &folderID
	visited := make(map[int64]bool)

	for currentID != nil {
		if visited[*currentID] {
			break
		}
		visited[*currentID] = true

		rows, err := s.pool.Query(ctx,
			`SELECT id, user_id, topic_id, parent_folder_id, name FROM folders WHERE id = @id`,
			pgx.NamedArgs{"id": *currentID},
		)
		if err != nil {
			break
		}
		rec, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[entity.FolderRecord])
		if err != nil {
			break
		}
		chain = append([]model.Folder{entity.FolderFromRecord(rec)}, chain...)
		currentID = rec.ParentFolderID
	}
	return chain, nil
}

// --- Attachments ---

const attachmentColumns = `id, note_id, user_id, type, file_id, file_path, file_name, mime_type, file_size, created_at`

func (s *PostgresStore) CreateAttachment(att model.Attachment) (model.Attachment, error) {
	rec := entity.AttachmentToRecord(att)
	rows, err := s.pool.Query(context.Background(),
		`INSERT INTO attachments (note_id, user_id, type, file_id, file_path, file_name, mime_type, file_size, created_at)
		 VALUES (@note_id, @user_id, @type, @file_id, @file_path, @file_name, @mime_type, @file_size, @created_at)
		 RETURNING `+attachmentColumns,
		pgx.NamedArgs{
			"note_id":    rec.NoteID,
			"user_id":    rec.UserID,
			"type":       rec.Type,
			"file_id":    rec.FileID,
			"file_path":  rec.FilePath,
			"file_name":  rec.FileName,
			"mime_type":  rec.MimeType,
			"file_size":  rec.FileSize,
			"created_at": rec.CreatedAt,
		},
	)
	if err != nil {
		return model.Attachment{}, fmt.Errorf("добавление вложения: %w", err)
	}
	created, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[entity.AttachmentRecord])
	if err != nil {
		return model.Attachment{}, fmt.Errorf("добавление вложения: %w", err)
	}
	return entity.AttachmentFromRecord(created), nil
}

func (s *PostgresStore) ListAttachments(noteID int64) ([]model.Attachment, error) {
	rows, err := s.pool.Query(context.Background(),
		`SELECT `+attachmentColumns+` FROM attachments WHERE note_id = @note_id ORDER BY id`,
		pgx.NamedArgs{"note_id": noteID},
	)
	if err != nil {
		return nil, fmt.Errorf("список вложений: %w", err)
	}
	recs, err := pgx.CollectRows(rows, pgx.RowToStructByName[entity.AttachmentRecord])
	if err != nil {
		return nil, fmt.Errorf("чтение вложений: %w", err)
	}
	result := make([]model.Attachment, 0, len(recs))
	for _, r := range recs {
		result = append(result, entity.AttachmentFromRecord(r))
	}
	return result, nil
}

func (s *PostgresStore) GetAttachment(attID int64) (model.Attachment, error) {
	rows, err := s.pool.Query(context.Background(),
		`SELECT `+attachmentColumns+` FROM attachments WHERE id = @id`,
		pgx.NamedArgs{"id": attID},
	)
	if err != nil {
		return model.Attachment{}, fmt.Errorf("поиск вложения: %w", err)
	}
	rec, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[entity.AttachmentRecord])
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Attachment{}, errs.ErrAttachmentNotFound
	}
	if err != nil {
		return model.Attachment{}, fmt.Errorf("поиск вложения: %w", err)
	}
	return entity.AttachmentFromRecord(rec), nil
}

func (s *PostgresStore) DeleteAttachment(attID int64) error {
	res, err := s.pool.Exec(context.Background(),
		`DELETE FROM attachments WHERE id = @id`,
		pgx.NamedArgs{"id": attID},
	)
	if err != nil {
		return fmt.Errorf("удаление вложения: %w", err)
	}
	if res.RowsAffected() == 0 {
		return errs.ErrAttachmentNotFound
	}
	return nil
}

// --- Settings ---

const settingsColumns = `user_id, show_counts, breadcrumb_inline, breadcrumb_bottom, show_keyboard, timezone_offset, folders_collapsed`

// GetSettings возвращает настройки пользователя (ErrSettingsNotFound — записи нет).
func (s *PostgresStore) GetSettings(userID int64) (model.UserSettings, error) {
	rows, err := s.pool.Query(context.Background(),
		`SELECT `+settingsColumns+` FROM user_settings WHERE user_id = @user_id`,
		pgx.NamedArgs{"user_id": userID},
	)
	if err != nil {
		return model.UserSettings{}, fmt.Errorf("чтение настроек: %w", err)
	}
	rec, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[entity.SettingsRecord])
	if errors.Is(err, pgx.ErrNoRows) {
		return model.UserSettings{}, errs.ErrSettingsNotFound
	}
	if err != nil {
		return model.UserSettings{}, fmt.Errorf("чтение настроек: %w", err)
	}
	return entity.SettingsFromRecord(rec), nil
}

// SaveSettings сохраняет (создаёт или обновляет) настройки пользователя.
func (s *PostgresStore) SaveSettings(settings model.UserSettings) error {
	rec := entity.SettingsToRecord(settings)
	_, err := s.pool.Exec(context.Background(),
		`INSERT INTO user_settings (user_id, show_counts, breadcrumb_inline, breadcrumb_bottom, show_keyboard, timezone_offset, folders_collapsed)
		 VALUES (@user_id, @show_counts, @breadcrumb_inline, @breadcrumb_bottom, @show_keyboard, @timezone_offset, @folders_collapsed)
		 ON CONFLICT (user_id) DO UPDATE SET
		     show_counts = EXCLUDED.show_counts,
		     breadcrumb_inline = EXCLUDED.breadcrumb_inline,
		     breadcrumb_bottom = EXCLUDED.breadcrumb_bottom,
		     show_keyboard = EXCLUDED.show_keyboard,
		     timezone_offset = EXCLUDED.timezone_offset,
		     folders_collapsed = EXCLUDED.folders_collapsed`,
		pgx.NamedArgs{
			"user_id":           rec.UserID,
			"show_counts":       rec.ShowCounts,
			"breadcrumb_inline": rec.BreadcrumbInline,
			"breadcrumb_bottom": rec.BreadcrumbBottom,
			"show_keyboard":     rec.ShowKeyboard,
			"timezone_offset":   rec.TimezoneOffset,
			"folders_collapsed": rec.FoldersCollapsed,
		},
	)
	if err != nil {
		return fmt.Errorf("сохранение настроек: %w", err)
	}
	return nil
}
