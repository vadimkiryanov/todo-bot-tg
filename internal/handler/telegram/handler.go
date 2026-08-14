package telegram

import (
	"fmt"
	"strings"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"

	"todo-bot-tg/internal/model"
)

// NoteService — интерфейс сервиса заметок (определён потребителем — handler'ом).
type NoteService interface {
	AddNote(userID, topicID int64, folderID *int64, text string, priority int) (model.Note, error)
	ListNotes(userID, topicID int64, folderID *int64) ([]model.Note, error)
	GetNote(userID, noteID int64) (model.Note, error)
	EditNote(userID, noteID int64, text string) error
	DeleteNote(userID, noteID int64) error
	ArchiveNote(userID, noteID int64) error
	UnarchiveNote(userID, noteID int64) error
	MarkDone(userID, noteID int64) error
	MarkUndone(userID, noteID int64) error
	SetPriority(userID, noteID int64, priority int) error
	SetReminder(userID, noteID int64, at time.Time, repeat model.ReminderRepeat) error
	ClearReminder(userID, noteID int64) error
	ProcessPendingReminders() ([]model.Note, error)
	CountNotes(userID, topicID int64, folderID *int64) (int, error)
	CountDoneNotes(userID, topicID int64, folderID *int64) (int, error)
	ListArchived(userID int64) ([]model.Note, error)
	CountArchived(userID int64) (int, error)
	ListTimers(userID int64) ([]model.Note, error)
	SeedDefaults(userID int64) error
	MoveNote(userID, noteID int64, topicID int64, folderID *int64) error
}

// TopicService — интерфейс сервиса топиков (определён потребителем — handler'ом).
type TopicService interface {
	CreateTopic(userID int64, name string) (model.Topic, error)
	ListTopics(userID int64) ([]model.Topic, error)
	GetTopic(userID, topicID int64) (model.Topic, error)
	DeleteTopic(userID, topicID int64) error
}

// FolderService — интерфейс сервиса папок (определён потребителем — handler'ом).
type FolderService interface {
	CreateFolder(userID, topicID int64, parentFolderID *int64, name string) (model.Folder, error)
	ListFolders(userID, topicID int64, parentFolderID *int64) ([]model.Folder, error)
	GetFolder(userID, folderID int64) (model.Folder, error)
	GetFolderChain(folderID int64) ([]model.Folder, error)
	CountFolders(userID, topicID int64, parentFolderID *int64) (int, error)
}

// AttachmentService — интерфейс сервиса вложений (определён потребителем — handler'ом).
type AttachmentService interface {
	AddAttachment(userID, noteID int64, attType model.AttachmentType, fileID, fileName, mimeType string, fileSize int64, data []byte) (model.Attachment, error)
	ListAttachments(userID, noteID int64) ([]model.Attachment, error)
	GetAttachment(userID, attID int64) (model.Attachment, error)
	DeleteAttachment(userID, attID int64) error
}

// Handler — обработчик обновлений Telegram.
type Handler struct {
	api               *tgbotapi.BotAPI
	noteService       NoteService
	topicService      TopicService
	folderService     FolderService
	attachmentService AttachmentService
	states            *StateManager
	selfUsername      string // @-имя бота для обрезки SwitchInlineQuery
}

// NewHandler создаёт новый Handler.
func NewHandler(token string, noteService NoteService, topicService TopicService, folderService FolderService, attachmentService AttachmentService) (*Handler, error) {
	api, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return nil, fmt.Errorf("ошибка подключения к Telegram API: %w", err)
	}

	h := &Handler{
		api:               api,
		noteService:       noteService,
		topicService:      topicService,
		folderService:     folderService,
		attachmentService: attachmentService,
		states:            NewStateManager(),
		selfUsername:      "@" + api.Self.UserName,
	}

	if err := h.registerCommands(); err != nil {
		return nil, fmt.Errorf("ошибка регистрации команд: %w", err)
	}

	return h, nil
}

// Run запускает обработку обновлений.
func (h *Handler) Run() error {
	u := tgbotapi.NewUpdate(0)
	u.Timeout = 60
	updates := h.api.GetUpdatesChan(u)

	for update := range updates {
		if update.CallbackQuery != nil {
			h.handleCallback(update.CallbackQuery)
			continue
		}
		if update.Message == nil {
			continue
		}
		if update.Message.IsCommand() {
			h.handleCommand(update.Message)
		} else {
			h.handleMessage(update.Message)
		}
	}
	return nil
}

// Stop останавливает получение обновлений.
func (h *Handler) Stop() {
	h.api.StopReceivingUpdates()
}

// SendReminder отправляет пользователю сообщение-напоминание.
// Реализует порт reminder.NotificationSender: воркер напоминаний не знает о Telegram.
func (h *Handler) SendReminder(note model.Note) error {
	text := fmt.Sprintf("⏰ Напоминание:\n\n%s", note.Text)
	msg := tgbotapi.NewMessage(note.UserID, text)
	msg.ReplyMarkup = buildReminderNotificationMarkup(note.ID)
	_, err := h.api.Send(msg)
	return err
}

// --- Commands ---

func (h *Handler) handleCommand(msg *tgbotapi.Message) {
	userID := msg.From.ID
	cmd := strings.ToLower(msg.Command())
	args := msg.CommandArguments()

	h.states.Reset(userID)

	switch cmd {
	case "start":
		h.cmdStart(msg)
	case "help":
		h.cmdHelp(msg)
	case "topics":
		h.cmdTopics(msg, userID)
	case "newtopic":
		h.cmdNewTopic(msg, userID, args)
	case "settopic":
		h.cmdSetTopic(msg, userID, args)
	case "deltopic":
		h.cmdDelTopic(msg, userID, args)
	case "list":
		h.cmdList(msg, userID)
	case "add":
		h.cmdAdd(msg, userID, args)
	case "edit":
		h.cmdEdit(msg, userID, args)
	case "delete":
		h.cmdDelete(msg, userID, args)
	case "archive":
		h.cmdArchive(msg, userID, args)
	case "backup":
		h.cmdBackup(msg)
	case "archived":
		h.deleteUserMsg(msg)
		h.showArchived(msg.Chat.ID, h.states.Get(userID).LastListMsgID, userID)
	case "timers":
		h.cmdTimers(msg, userID)
	case "newfolder":
		h.cmdNewFolder(msg, userID, args)
	case "settings":
		h.cmdSettings(msg, userID)
	default:
		if h.tryNavigateFolder(msg, userID, cmd, args) {
			return
		}
		h.send(msg.Chat.ID, "Неизвестная команда. Введите /help для списка команд.")
	}
}

// --- Messages (interactive state) ---

func (h *Handler) handleMessage(msg *tgbotapi.Message) {
	userID := msg.From.ID
	text := strings.TrimSpace(msg.Text)

	s := h.states.Get(userID)

	// Медиа-сообщение — вложение к заметке
	if att, ok := extractMedia(msg); ok {
		h.handleAttachmentMessage(msg, userID, att)
		return
	}

	switch s.State {
	case StateWaitingAddText:
		h.finishAdd(msg, userID, text)
	case StateWaitingPriority:
		// Пользователь ввёл новый текст вместо выбора приоритета — начинаем заново
		h.states.Reset(userID)
		h.doAdd(msg.Chat.ID, userID, text, msg.MessageID)
	case StateWaitingDeleteID:
		h.finishDelete(msg, userID, text)
	case StateWaitingEditArgs:
		h.finishEdit(msg, userID, text)
	case StateWaitingEditText:
		h.finishEditText(msg, userID, text)
	case StateWaitingArchiveID:
		h.finishArchive(msg, userID, text)
	case StateWaitingNewTopic:
		h.finishNewTopic(msg, userID, text)
	case StateWaitingSetTopic:
		h.finishSetTopic(msg, userID, text)
	case StateWaitingNewFolder:
		h.finishNewFolder(msg, userID, text)
	case StateWaitingAttachment:
		// Текст вместо медиа — отменяем прикрепление вложения
		h.clearPrompt(msg.Chat.ID, userID)
		h.deleteUserMsg(msg)
		h.states.Reset(userID)
		h.send(msg.Chat.ID, "❌ Ожидался файл. Прикрепление отменено.")
	default:
		// Обрезаем @bot_username из SwitchInlineQuery
		if idx := strings.Index(text, "\n"); idx != -1 {
			firstLine := text[:idx]
			if strings.TrimSpace(firstLine) == h.selfUsername {
				text = strings.TrimSpace(text[idx+1:])
				h.handleCommandText(msg, userID, text)
				return
			}
		}

		// Обрабатываем нажатия reply-клавиатуры
		switch {
		case text == "📝 Список":
			h.cmdList(msg, userID)
		case text == "📂 Топики":
			h.cmdTopics(msg, userID)
		default:
			h.doAdd(msg.Chat.ID, userID, text, msg.MessageID)
		}
	}
}

// handleCommandText парсит текст после обрезки @bot_username.
func (h *Handler) handleCommandText(msg *tgbotapi.Message, userID int64, text string) {
	if strings.HasPrefix(text, "/") {
		oldText := msg.Text
		msg.Text = text
		h.handleCommand(msg)
		msg.Text = oldText
		return
	}

	noteID := h.states.Get(userID).LastViewedNoteID
	if noteID != 0 {
		h.doEdit(msg.Chat.ID, userID, noteID, text, msg.MessageID)
		return
	}

	h.doAdd(msg.Chat.ID, userID, text, msg.MessageID)
}
