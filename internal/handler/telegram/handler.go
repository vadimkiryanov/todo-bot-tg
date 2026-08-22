package telegram

import (
	"fmt"
	"log/slog"
	"strings"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"

	"todo-bot-tg/internal/model"
)

// NoteService — интерфейс сервиса заметок (определён потребителем — handler'ом).
type NoteService interface {
	AddNote(userID, topicID int64, folderID *int64, text string, entities []model.NoteEntity, priority model.Priority) (model.Note, error)
	ListNotes(userID, topicID int64, folderID *int64) ([]model.Note, error)
	GetNote(userID, noteID int64) (model.Note, error)
	EditNote(userID, noteID int64, text string, entities []model.NoteEntity) error
	DeleteNote(userID, noteID int64) error
	ArchiveNote(userID, noteID int64) error
	UnarchiveNote(userID, noteID int64) error
	MarkDone(userID, noteID int64) error
	MarkUndone(userID, noteID int64) error
	PinNote(userID, noteID int64) error
	PinNoteUntil(userID, noteID int64, at time.Time) error
	UnpinNote(userID, noteID int64) error
	SetPriority(userID, noteID int64, priority model.Priority) error
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

// SettingsService — интерфейс сервиса настроек (определён потребителем — handler'ом).
type SettingsService interface {
	GetSettings(userID int64) (model.UserSettings, error)
	SaveSettings(settings model.UserSettings) error
}

// UserResolver — резолвит telegram_id ↔ users.id, создавая запись
// пользователя при первом обращении (репозиторий users в repository/todo).
type UserResolver interface {
	FindOrCreateByTelegramID(telegramID int64) (int64, error)
	GetTelegramID(userID int64) (int64, error)
}

// Handler — обработчик обновлений Telegram.
type Handler struct {
	api               *tgbotapi.BotAPI
	noteService       NoteService
	topicService      TopicService
	folderService     FolderService
	attachmentService AttachmentService
	settingsService   SettingsService
	userResolver      UserResolver
	states            *StateManager
	selfUsername      string // @-имя бота для обрезки SwitchInlineQuery
}

// NewHandler создаёт новый Handler.
func NewHandler(token string, noteService NoteService, topicService TopicService, folderService FolderService, attachmentService AttachmentService, settingsService SettingsService, userResolver UserResolver) (*Handler, error) {
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
		settingsService:   settingsService,
		userResolver:      userResolver,
		states:            NewStateManager(),
		selfUsername:      "@" + api.Self.UserName,
	}

	if err := h.registerCommands(); err != nil {
		return nil, fmt.Errorf("ошибка регистрации команд: %w", err)
	}

	return h, nil
}

// Run запускает обработку обновлений.
// userID для сервисного слоя — users.id из FindOrCreateByTelegramID (§3.4),
// а не сырой telegram_id.
func (h *Handler) Run() error {
	u := tgbotapi.NewUpdate(0)
	u.Timeout = 60
	updates := h.api.GetUpdatesChan(u)

	for update := range updates {
		// Определяем отправителя (CallbackQuery или Message)
		var telegramID int64
		switch {
		case update.CallbackQuery != nil:
			telegramID = update.CallbackQuery.From.ID
		case update.Message != nil:
			telegramID = update.Message.From.ID
		default:
			continue
		}

		userID, err := h.userResolver.FindOrCreateByTelegramID(telegramID)
		if err != nil {
			slog.Error("резолв пользователя", "telegram_id", telegramID, "error", err)
			continue
		}

		if update.CallbackQuery != nil {
			h.ensureSettings(userID)
			h.handleCallback(update.CallbackQuery, userID)
			continue
		}
		if update.Message == nil {
			continue
		}
		h.ensureSettings(userID)
		if update.Message.IsCommand() {
			h.handleCommand(update.Message, userID)
		} else {
			h.handleMessage(update.Message, userID)
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
// Если у заметки есть форматирование — текст отправляется с ним (ParseMode=HTML).
func (h *Handler) SendReminder(note model.Note) error {
	chatID := note.UserID
	// Заметки хранят users.id, а не telegram_id (см. Run) — резолвим обратно.
	// Для легаси-заметок (user_id == telegram_id) GetTelegramID вернёт ошибку —
	// тогда отправляем в note.UserID как раньше.
	if tgID, err := h.userResolver.GetTelegramID(note.UserID); err == nil && tgID != 0 {
		chatID = tgID
	}
	msg := tgbotapi.NewMessage(chatID, fmt.Sprintf("⏰ Напоминание:\n\n%s", note.Text))
	if len(note.Entities) > 0 {
		msg.ParseMode = tgbotapi.ModeHTML
		msg.Text = fmt.Sprintf("⏰ Напоминание:\n\n%s", entitiesToHTML(note.Text, note.Entities))
	}
	msg.ReplyMarkup = buildReminderNotificationMarkup(note.ID)
	_, err := h.api.Send(msg)
	return err
}

// --- Settings ---

// ensureSettings загружает настройки пользователя из хранилища в сессию.
// Выполняется один раз за жизнь процесса (флаг SettingsLoaded в сессии),
// чтобы переживать перезапуск бота: после рестарта сессии пусты, а настройки
// уже сохранены в БД.
func (h *Handler) ensureSettings(userID int64) {
	session := h.states.Get(userID)
	if session.SettingsLoaded {
		return
	}
	session.SettingsLoaded = true

	settings, err := h.settingsService.GetSettings(userID)
	if err != nil {
		slog.Warn("загрузка настроек", "user_id", userID, "error", err)
		return
	}
	session.ShowCounts = settings.ShowCounts
	session.BreadcrumbInline = settings.BreadcrumbInline
	session.BreadcrumbBottom = settings.BreadcrumbBottom
	session.ShowKeyboard = settings.ShowKeyboard
	session.TimezoneOffset = settings.TimezoneOffset
	session.FoldersCollapsed = settings.FoldersCollapsed
	session.QuickTopicsCount = settings.QuickTopicsCount
	session.QuickTopicIDs = settings.QuickTopicIDs
	if session.QuickTopicsCount < 0 {
		session.QuickTopicsCount = 0
	}
}

// persistSettings сохраняет настройки из сессии в хранилище.
func (h *Handler) persistSettings(userID int64) {
	session := h.states.Get(userID)
	settings := model.UserSettings{
		UserID:           userID,
		ShowCounts:       session.ShowCounts,
		BreadcrumbInline: session.BreadcrumbInline,
		BreadcrumbBottom: session.BreadcrumbBottom,
		ShowKeyboard:     session.ShowKeyboard,
		TimezoneOffset:   session.TimezoneOffset,
		FoldersCollapsed: session.FoldersCollapsed,
		QuickTopicsCount: session.QuickTopicsCount,
		QuickTopicIDs:    append([]int64(nil), session.QuickTopicIDs...),
	}
	if err := h.settingsService.SaveSettings(settings); err != nil {
		slog.Warn("сохранение настроек", "user_id", userID, "error", err)
	}
}

// --- Commands ---

func (h *Handler) handleCommand(msg *tgbotapi.Message, userID int64) {
	cmd := strings.ToLower(msg.Command())
	args := msg.CommandArguments()

	h.states.Reset(userID)

	switch cmd {
	case "start":
		h.cmdStart(msg, userID)
	case "help":
		h.cmdHelp(msg, userID)
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

func (h *Handler) handleMessage(msg *tgbotapi.Message, userID int64) {
	s := h.states.Get(userID)

	// Медиа-сообщение — вложение к заметке
	if att, ok := extractMedia(msg); ok {
		h.handleAttachmentMessage(msg, userID, att)
		return
	}

	// Текст и сущности форматирования (смещения — относительно обрезанного текста)
	text, entities := trimNoteText(msg.Text, extractNoteEntities(msg.Entities))

	switch s.State {
	case StateWaitingAddText:
		h.finishAdd(msg, userID, text, entities)
	case StateWaitingPriority:
		// Пользователь ввёл новый текст вместо выбора приоритета — начинаем заново
		h.states.Reset(userID)
		h.doAdd(msg.Chat.ID, userID, text, entities, msg.MessageID)
	case StateWaitingDeleteID:
		h.finishDelete(msg, userID, text)
	case StateWaitingEditArgs:
		h.finishEdit(msg, userID, text, entities)
	case StateWaitingEditText:
		h.finishEditText(msg, userID, text, entities)
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
		// Обрезаем @bot_username из SwitchInlineQuery (первая строка сообщения)
		if idx := strings.Index(msg.Text, "\n"); idx != -1 {
			if strings.TrimSpace(msg.Text[:idx]) == h.selfUsername {
				shift := utf16Len(msg.Text[:idx+1]) // позиция после первой строки
				rest, ents := trimNoteText(
					msg.Text[idx+1:],
					shiftNoteEntities(extractNoteEntities(msg.Entities), shift, utf16Len(msg.Text[idx+1:])),
				)
				h.handleCommandText(msg, userID, rest, ents)
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
			h.doAdd(msg.Chat.ID, userID, text, entities, msg.MessageID)
		}
	}
}

// handleCommandText парсит текст после обрезки @bot_username.
func (h *Handler) handleCommandText(msg *tgbotapi.Message, userID int64, text string, entities []model.NoteEntity) {
	if strings.HasPrefix(text, "/") {
		oldText := msg.Text
		msg.Text = text
		h.handleCommand(msg, userID)
		msg.Text = oldText
		return
	}

	noteID := h.states.Get(userID).LastViewedNoteID
	if noteID != 0 {
		// Кнопка ✏️ подставляет в поле ввода plain-текст без entities —
		// восстанавливаем форматирование из сохранённой заметки, если текст
		// не изменился (или менялся только по краям).
		if len(entities) == 0 {
			if note, err := h.noteService.GetNote(userID, noteID); err == nil {
				entities = reviveNoteEntities(note.Text, text, note.Entities)
			}
		}
		h.doEdit(msg.Chat.ID, userID, noteID, text, entities, msg.MessageID)
		return
	}

	h.doAdd(msg.Chat.ID, userID, text, entities, msg.MessageID)
}
