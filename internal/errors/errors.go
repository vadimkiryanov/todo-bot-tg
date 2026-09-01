package errors

import "errors"

// Общие
var (
	ErrNotFound        = errors.New("не найдено")
	ErrNotEnoughParts  = errors.New("недостаточно")
	ErrEmptyText       = errors.New("текст заметки не может быть пустым")
	ErrEmptyName       = errors.New("название топика не может быть пустым")
	ErrEmptyFolderName = errors.New("название папки не может быть пустым")
)

// Topic
var (
	ErrTopicAlreadyExists = errors.New("топик с таким названием уже существует")
	ErrTopicNotFound      = errors.New("топик не найден")
)

// Note
var (
	ErrNoteNotFound   = errors.New("заметка не найдена")
	ErrReminderInPast = errors.New("время напоминания уже прошло")
)

// Value Object
var (
	ErrInvalidPriority       = errors.New("некорректный приоритет заметки")
	ErrInvalidReminderRepeat = errors.New("некорректный тип повторения напоминания")
)

// Folder
var (
	ErrFolderAlreadyExists = errors.New("папка с таким названием уже существует")
	ErrFolderNotFound      = errors.New("папка не найдена")
)

// Attachment
var (
	ErrAttachmentNotFound    = errors.New("вложение не найдено")
	ErrInvalidAttachmentType = errors.New("некорректный тип вложения")
	ErrEmptyFileID           = errors.New("file_id вложения пуст")
	ErrEmptyFilePath         = errors.New("путь к файлу вложения пуст")
	ErrEmptyFile             = errors.New("файл пуст")
	ErrFileTooLarge          = errors.New("файл слишком большой (лимит 20 МБ)")
)

// Settings
var (
	ErrSettingsNotFound = errors.New("настройки не найдены")
)

// User / Auth (веб-приложение)
var (
	ErrUserNotFound        = errors.New("пользователь не найден")
	ErrUsernameTaken       = errors.New("имя пользователя уже занято")
	ErrInvalidUsername     = errors.New("логин должен быть 3–32 символа: латиница, цифры, подчёркивание")
	ErrInvalidPassword     = errors.New("пароль должен быть не короче 8 символов")
	ErrInvalidCredentials  = errors.New("неверный логин или пароль")
	ErrInvalidJSON         = errors.New("некорректный JSON")
	ErrInvalidTelegramAuth = errors.New("некорректные данные авторизации Telegram")
	ErrSessionNotFound     = errors.New("сессия не найдена")
	ErrSessionExpired      = errors.New("сессия истекла")
	ErrInvalidPasswordHash = errors.New("некорректный хеш пароля")
)
