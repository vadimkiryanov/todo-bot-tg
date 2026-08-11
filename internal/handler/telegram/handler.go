package telegram

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
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
	GetNoteByID(noteID int64) (model.Note, error)
	ProcessPendingReminders() ([]model.Note, error)
	CountNotes(userID, topicID int64, folderID *int64) (int, error)
	CountDoneNotes(userID, topicID int64, folderID *int64) (int, error)
	ListArchived(userID int64) ([]model.Note, error)
	CountArchived(userID int64) (int, error)
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

// Handler — обработчик обновлений Telegram.
type Handler struct {
	api           *tgbotapi.BotAPI
	noteService   NoteService
	topicService  TopicService
	folderService FolderService
	states        *StateManager
	selfUsername  string // @-имя бота для обрезки SwitchInlineQuery
	stopCh        chan struct{}
}

// NewHandler создаёт новый Handler.
func NewHandler(token string, noteService NoteService, topicService TopicService, folderService FolderService) (*Handler, error) {
	api, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return nil, fmt.Errorf("ошибка подключения к Telegram API: %w", err)
	}

	h := &Handler{
		api:           api,
		noteService:   noteService,
		topicService:  topicService,
		folderService: folderService,
		states:        NewStateManager(),
		selfUsername:  "@" + api.Self.UserName,
		stopCh:        make(chan struct{}),
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

// StartReminderWorker запускает фоновый воркер проверки напоминаний.
func (h *Handler) StartReminderWorker() {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-h.stopCh:
				return
			case <-ticker.C:
				notes, err := h.noteService.ProcessPendingReminders()
				if err != nil {
					continue
				}
				for _, n := range notes {
					text := fmt.Sprintf("⏰ Напоминание:\n\n%s", n.Text)
					msg := tgbotapi.NewMessage(n.UserID, text)
					msg.ReplyMarkup = buildReminderNotificationMarkup(n.ID)
					h.api.Send(msg)
				}
			}
		}
	}()
}

// Stop останавливает получение обновлений и фоновые процессы.
func (h *Handler) Stop() {
	h.api.StopReceivingUpdates()
	close(h.stopCh)
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

// --- Callbacks ---

func (h *Handler) handleCallback(cb *tgbotapi.CallbackQuery) {
	userID := cb.From.ID
	data := cb.Data
	chatID := cb.Message.Chat.ID
	msgID := cb.Message.MessageID

	h.api.Request(tgbotapi.NewCallback(cb.ID, ""))

	if data == "backtolist" {
		h.callbackBackToList(chatID, msgID, userID)
		return
	}
	if data == "backfolder" {
		h.callbackBackFolder(chatID, msgID, userID)
		return
	}
	if data == "addnote" {
		h.callbackAddNote(chatID, userID)
		return
	}
	if data == "moveup" {
		h.callbackMoveUp(chatID, msgID, userID)
		return
	}
	if data == "moveinsert" {
		h.callbackMoveInsert(chatID, msgID, userID)
		return
	}
	if data == "donefolder" {
		h.callbackDoneFolder(chatID, msgID, userID)
		return
	}
	if strings.HasPrefix(data, "delremmsg:") {
		// Удаление сообщения-напоминания
		del := tgbotapi.NewDeleteMessage(chatID, msgID)
		h.api.Request(del)
		h.api.Request(tgbotapi.NewCallback(cb.ID, ""))
		return
	}

	parts := strings.SplitN(data, ":", 2)
	if len(parts) != 2 {
		h.callbackAnswer(chatID, msgID, "")
		return
	}
	action, idStr := parts[0], parts[1]

	switch action {
	case "settopic":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackSetTopic(chatID, msgID, userID, id)
	case "view":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackViewNote(chatID, msgID, userID, id)
	case "delnote":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackDeleteNote(chatID, userID, id)
	case "askdel":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.askDeleteNote(chatID, msgID, userID, id)
	case "confdel":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.doDelete(chatID, userID, id)
	case "archnote":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackArchiveNote(chatID, userID, id)
	case "page":
		subParts := strings.SplitN(idStr, ":", 2)
		if len(subParts) == 2 {
			page, err := strconv.Atoi(subParts[1])
			if err == nil {
				h.showListPage(chatID, msgID, userID, page)
			}
		}
	case "topics":
		h.cmdTopicsFromList(chatID, msgID, userID)
	case "archived":
		h.showArchived(chatID, msgID, userID)
	case "unarch":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.doUnarchive(chatID, msgID, userID, id)
	case "prio":
		priority, err := strconv.Atoi(idStr)
		if err != nil {
			return
		}
		h.callbackSetPriority(chatID, msgID, userID, priority)
	case "chprio":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackChangePriority(chatID, msgID, userID, id)
	case "done":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackMarkDone(chatID, msgID, userID, id)
	case "undone":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackMarkUndone(chatID, msgID, userID, id)
	case "remcal":
		h.callbackReminderCalendar(chatID, msgID, userID, idStr)
	case "remday":
		h.callbackReminderDay(chatID, msgID, userID, idStr)
	case "remhour":
		h.callbackReminderHour(chatID, msgID, userID, idStr)
	case "remmin":
		h.callbackReminderMinute(chatID, msgID, userID, idStr)
	case "remmrange":
		h.callbackReminderMinuteRange(chatID, msgID, userID, idStr)
	case "remrepeat":
		h.callbackReminderRepeat(chatID, msgID, userID, idStr)
	case "remclear":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackClearReminder(chatID, msgID, userID, id)
	case "remmenu":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackReminderMenu(chatID, msgID, userID, id)
	case "move":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackMovePicker(chatID, msgID, userID, id)
	case "movepick":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackMoveNavigate(chatID, msgID, userID, id)
	case "movetopic":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackMoveTopic(chatID, msgID, userID, id)
	case "movecancel":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackMoveCancel(chatID, msgID, userID, id)
	case "openfolder":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackOpenFolder(chatID, msgID, userID, id)
	case "backfolder":
		h.callbackBackFolder(chatID, msgID, userID)
	case "togglesettings":
		h.callbackToggleSettings(chatID, msgID, userID, idStr)
	case "crumb":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackCrumb(chatID, msgID, userID, id)
	case "expand":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackExpandNote(chatID, msgID, userID, id)
	case "collapse":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		h.callbackCollapseNote(chatID, msgID, userID, id)
	}
}

// ============================================================
// Command implementations
// ============================================================

func (h *Handler) cmdStart(msg *tgbotapi.Message) {
	h.deleteUserMsg(msg)

	userID := msg.From.ID
	// Создаём дефолтные топики и заметки для нового пользователя
	if err := h.noteService.SeedDefaults(userID); err == nil {
		// После сида ставим первый топик текущим
		topics, _ := h.topicService.ListTopics(userID)
		if len(topics) > 0 {
			h.states.Get(userID).CurrentTopicID = topics[0].ID
		}
	}

	kbd := h.newMsg(msg.Chat.ID, userID, "👋 Выбери действие:")
	sent, err := h.api.Send(kbd)
	if err == nil {
		h.states.Get(userID).LastListMsgID = sent.MessageID
	}
}

func (h *Handler) cmdHelp(msg *tgbotapi.Message) {
	h.deleteUserMsg(msg)

	userID := msg.From.ID
	text, markup := buildHelpMessage()
	msg2 := h.newMsg(msg.Chat.ID, userID, text)
	msg2.ParseMode = tgbotapi.ModeMarkdown
	msg2.ReplyMarkup = markup
	sent, err := h.api.Send(msg2)
	if err == nil {
		h.states.Get(msg.From.ID).LastListMsgID = sent.MessageID
	}
}

// --- Topics ---

func (h *Handler) cmdTopics(msg *tgbotapi.Message, userID int64) {
	h.deleteUserMsg(msg)
	h.showTopics(msg.Chat.ID, h.states.Get(userID).LastListMsgID, userID)
}

func (h *Handler) cmdTopicsFromList(chatID int64, msgID int, userID int64) {
	h.showTopics(chatID, msgID, userID)
}

func (h *Handler) showTopics(chatID int64, msgID int, userID int64) {
	currentID := h.states.Get(userID).CurrentTopicID
	topics, err := h.topicService.ListTopics(userID)
	if err != nil {
		h.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}

	if len(topics) == 0 {
		text := "📂 Топиков пока нет. Создайте новый: /newtopic <название>"
		if msgID != 0 {
			edit := tgbotapi.NewEditMessageText(chatID, msgID, text)
			if _, err := h.api.Send(edit); err == nil {
				return
			}
		}
		h.send(chatID, text)
		return
	}

	counts := make(map[int64]int)
	folderCounts := make(map[int64]int)
	showCounts := h.states.Get(userID).ShowCounts
	for _, t := range topics {
		c, _ := h.noteService.CountNotes(userID, t.ID, nil)
		counts[t.ID] = c
		fc, _ := h.folderService.CountFolders(userID, t.ID, nil)
		folderCounts[t.ID] = fc
	}

	text, markup := buildTopicsMessage(topics, currentID, userID, counts, folderCounts, showCounts)

	if msgID != 0 {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		edit.ParseMode = tgbotapi.ModeMarkdown
		if _, err := h.api.Send(edit); err == nil || isNotModified(err) {
			return
		}
	}
	msg := h.newMsg(chatID, userID, text)
	msg.ParseMode = tgbotapi.ModeMarkdown
	msg.ReplyMarkup = markup
	sent, err := h.api.Send(msg)
	if err == nil {
		h.states.Get(userID).LastListMsgID = sent.MessageID
	}
}

func (h *Handler) cmdNewTopic(msg *tgbotapi.Message, userID int64, args string) {
	name := strings.TrimSpace(args)
	if name == "" {
		h.states.Get(userID).PendingCmdMsgID = msg.MessageID
		h.states.SetState(userID, StateWaitingNewTopic)
		h.sendPrompt(msg.Chat.ID, userID, "📂 Введите название нового топика:")
		return
	}
	h.deleteUserMsg(msg)
	h.doNewTopic(msg.Chat.ID, userID, name)
}

func (h *Handler) cmdNewFolder(msg *tgbotapi.Message, userID int64, args string) {
	name := strings.TrimSpace(args)
	if name == "" {
		h.states.Get(userID).PendingCmdMsgID = msg.MessageID
		h.states.SetState(userID, StateWaitingNewFolder)
		h.sendPrompt(msg.Chat.ID, userID, "📁 Введите название новой папки:")
		return
	}
	h.deleteUserMsg(msg)
	h.doNewFolder(msg.Chat.ID, userID, name)
}

func (h *Handler) cmdSetTopic(msg *tgbotapi.Message, userID int64, args string) {
	idStr := strings.TrimSpace(args)
	if idStr == "" {
		h.states.Get(userID).PendingCmdMsgID = msg.MessageID
		h.states.SetState(userID, StateWaitingSetTopic)
		h.sendPrompt(msg.Chat.ID, userID, "📂 Введите ID топика (можно посмотреть в /topics):")
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		h.send(msg.Chat.ID, "❌ ID должен быть числом")
		return
	}
	h.doSetTopic(msg.Chat.ID, userID, id)
}

func (h *Handler) cmdDelTopic(msg *tgbotapi.Message, userID int64, args string) {
	id, err := strconv.ParseInt(strings.TrimSpace(args), 10, 64)
	if err != nil {
		h.send(msg.Chat.ID, "❌ Формат: /deltopic <id>")
		return
	}
	if err := h.topicService.DeleteTopic(userID, id); err != nil {
		h.send(msg.Chat.ID, fmt.Sprintf("❌ %v", err))
		return
	}

	session := h.states.Get(userID)
	if session.CurrentTopicID == id {
		session.CurrentTopicID = 0
	}
	h.sendReply(msg.Chat.ID, userID, fmt.Sprintf("🗑 Топик #%d удалён вместе с заметками.", id))
}

// --- Notes ---

func (h *Handler) cmdAdd(msg *tgbotapi.Message, userID int64, args string) {
	text := strings.TrimSpace(args)
	if text == "" {
		h.states.Get(userID).PendingCmdMsgID = msg.MessageID
		h.states.SetState(userID, StateWaitingAddText)
		h.sendPrompt(msg.Chat.ID, userID, "📝 Введите текст заметки:")
		return
	}
	h.doAdd(msg.Chat.ID, userID, text, msg.MessageID)
}

func (h *Handler) cmdList(msg *tgbotapi.Message, userID int64) {
	h.deleteUserMsg(msg)
	h.states.Get(userID).DoneFolderActive = false
	h.showListPage(msg.Chat.ID, h.states.Get(userID).LastListMsgID, userID, 0)
}

func (h *Handler) showList(chatID int64, userID int64) {
	h.states.Get(userID).DoneFolderActive = false
	h.showListPage(chatID, 0, userID, 0)
}

func (h *Handler) showListPage(chatID int64, msgID int, userID int64, page int) {
	const perPage = 10
	session := h.states.Get(userID)
	topicID := session.CurrentTopicID
	folderID := session.CurrentFolderID

	// Режим виртуальной папки выполненных
	if session.DoneFolderActive && topicID != 0 {
		h.showDoneFolderPage(chatID, msgID, userID, topicID, folderID, page, perPage)
		return
	}

	// Получаем папки в текущем контексте (только если выбран топик)
	var folders []model.Folder
	var folderChain []model.Folder
	var topicName string
	if topicID != 0 {
		folders, _ = h.folderService.ListFolders(userID, topicID, folderID)
		if folderID != nil {
			folderChain, _ = h.folderService.GetFolderChain(*folderID)
		}
		if t, err := h.topicService.GetTopic(userID, topicID); err == nil {
			topicName = t.Name
		}
	}

	notes, err := h.noteService.ListNotes(userID, topicID, folderID)
	if err != nil {
		h.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}

	// Скрываем выполненные заметки из основного списка (только в «✅ Выполненные»)
	var activeNotes []model.Note
	for _, n := range notes {
		if !n.Done {
			activeNotes = append(activeNotes, n)
		}
	}
	notes = activeNotes

	// Считаем выполненные для виртуальной папки (только в корне топика)
	doneCount := 0
	if topicID != 0 {
		doneCount, _ = h.noteService.CountDoneNotes(userID, topicID, folderID)
	}

	totalItems := len(folders) + len(notes)
	doneFolderActive := false
	showCounts := session.ShowCounts
	breadcrumbInline := session.BreadcrumbInline

	// Пустой список
	if totalItems == 0 && doneCount == 0 {
		text, markup := buildListMessage(nil, topicID, topicName, folderID, folderChain, 0, 1, showCounts, breadcrumbInline, 0, doneFolderActive)
		if msgID != 0 {
			edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
			if _, err := h.api.Send(edit); err == nil || isNotModified(err) {
				return
			}
		}
		msg := h.newMsg(chatID, userID, text)
		msg.ReplyMarkup = markup
		sent, err := h.api.Send(msg)
		if err == nil {
			h.states.Get(userID).LastListMsgID = sent.MessageID
		}
		return
	}

	totalPages := (totalItems + perPage - 1) / perPage
	if totalPages == 0 {
		totalPages = 1
	}
	if page < 0 {
		page = 0
	}
	if page >= totalPages {
		page = totalPages - 1
	}

	start := page * perPage
	end := start + perPage
	if end > totalItems {
		end = totalItems
	}

	// Собираем элементы текущей страницы: сначала папки, потом заметки
	var pageItems []listItem
	for i := start; i < end; i++ {
		if i < len(folders) {
			f := folders[i]
			item := listItem{isFolder: true, folder: f}
			if showCounts {
				item.noteCount, _ = h.noteService.CountNotes(userID, topicID, &f.ID)
				item.folderCount, _ = h.folderService.CountFolders(userID, topicID, &f.ID)
			}
			pageItems = append(pageItems, item)
		} else {
			noteIdx := i - len(folders)
			if noteIdx < len(notes) {
				pageItems = append(pageItems, listItem{isFolder: false, note: notes[noteIdx]})
			}
		}
	}

	text, markup := buildListMessage(pageItems, topicID, topicName, folderID, folderChain, page, totalPages, showCounts, breadcrumbInline, doneCount, doneFolderActive)

	if msgID != 0 {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		if _, err := h.api.Send(edit); err == nil || isNotModified(err) {
			return
		}
	}
	msg2 := tgbotapi.NewMessage(chatID, text)
	msg2.ReplyMarkup = markup
	sent, err := h.api.Send(msg2)
	if err == nil {
		h.states.Get(userID).LastListMsgID = sent.MessageID
	}
}

// showDoneFolderPage — страница виртуальной папки выполненных заметок.
func (h *Handler) showDoneFolderPage(chatID int64, msgID int, userID int64, topicID int64, folderID *int64, page int, perPage int) {
	session := h.states.Get(userID)

	var topicName string
	if t, err := h.topicService.GetTopic(userID, topicID); err == nil {
		topicName = t.Name
	}

	// Получаем заметки текущей папки и фильтруем только выполненные
	notes, err := h.noteService.ListNotes(userID, topicID, folderID)
	if err != nil {
		h.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}

	var doneNotes []model.Note
	for _, n := range notes {
		if n.Done {
			doneNotes = append(doneNotes, n)
		}
	}

	totalItems := len(doneNotes)
	if totalItems == 0 {
		// Не должно случиться, но на всякий случай — возвращаемся в список
		session.DoneFolderActive = false
		h.showList(chatID, userID)
		return
	}

	// Цепочка папок для breadcrumb
	var folderChain []model.Folder
	if folderID != nil {
		folderChain, _ = h.folderService.GetFolderChain(*folderID)
	}

	totalPages := (totalItems + perPage - 1) / perPage
	if totalPages == 0 {
		totalPages = 1
	}
	if page < 0 {
		page = 0
	}
	if page >= totalPages {
		page = totalPages - 1
	}

	start := page * perPage
	end := start + perPage
	if end > totalItems {
		end = totalItems
	}

	var pageItems []listItem
	for i := start; i < end; i++ {
		pageItems = append(pageItems, listItem{isFolder: false, note: doneNotes[i]})
	}

	text, markup := buildListMessage(pageItems, topicID, topicName, folderID, folderChain, page, totalPages, session.ShowCounts, session.BreadcrumbInline, 0, true)

	if msgID != 0 {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		if _, err := h.api.Send(edit); err == nil || isNotModified(err) {
			return
		}
	}
	msg2 := tgbotapi.NewMessage(chatID, text)
	msg2.ReplyMarkup = markup
	sent, err := h.api.Send(msg2)
	if err == nil {
		session.LastListMsgID = sent.MessageID
	}
}

func (h *Handler) cmdEdit(msg *tgbotapi.Message, userID int64, args string) {
	args = strings.TrimSpace(args)
	if args == "" {
		h.states.Get(userID).PendingCmdMsgID = msg.MessageID
		h.states.SetState(userID, StateWaitingEditArgs)
		h.sendPrompt(msg.Chat.ID, userID, "✏️ Введите ID заметки и новый текст:\n`<id> <текст>`")
		return
	}
	parts := strings.SplitN(args, " ", 2)
	if len(parts) < 2 {
		h.send(msg.Chat.ID, "❌ Формат: /edit <id> <текст>")
		return
	}
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		h.send(msg.Chat.ID, "❌ ID должен быть числом")
		return
	}
	h.doEdit(msg.Chat.ID, userID, id, parts[1], msg.MessageID)
}

func (h *Handler) cmdDelete(msg *tgbotapi.Message, userID int64, args string) {
	idStr := strings.TrimSpace(args)
	if idStr == "" {
		h.states.Get(userID).PendingCmdMsgID = msg.MessageID
		h.states.SetState(userID, StateWaitingDeleteID)
		h.sendPrompt(msg.Chat.ID, userID, "🗑 Введите ID заметки для удаления:")
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		h.send(msg.Chat.ID, "❌ ID должен быть числом")
		return
	}
	h.doDelete(msg.Chat.ID, userID, id)
}

func (h *Handler) cmdArchive(msg *tgbotapi.Message, userID int64, args string) {
	idStr := strings.TrimSpace(args)
	if idStr == "" {
		h.states.Get(userID).PendingCmdMsgID = msg.MessageID
		h.states.SetState(userID, StateWaitingArchiveID)
		h.sendPrompt(msg.Chat.ID, userID, "📦 Введите ID заметки для архивации:")
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		h.send(msg.Chat.ID, "❌ ID должен быть числом")
		return
	}
	h.doArchive(msg.Chat.ID, userID, id)
}

func (h *Handler) cmdBackup(msg *tgbotapi.Message) {
	h.send(msg.Chat.ID, "⏳ Делаю бэкап...")

	dbURL := os.Getenv("DATABASE_URL")
	host, user, pass, dbname := "db", "todobot", "todobot", "todobot"
	if u, err := parseURL(dbURL); err == nil {
		host = u.host
		user = u.user
		pass = u.pass
		dbname = u.dbname
	}

	f, err := os.CreateTemp("", "todobot-backup-*.sql")
	if err != nil {
		h.send(msg.Chat.ID, fmt.Sprintf("❌ Ошибка создания файла: %v", err))
		return
	}
	defer os.Remove(f.Name())

	cmd := exec.Command("pg_dump",
		"-h", host,
		"-U", user,
		dbname,
	)
	cmd.Env = append(os.Environ(), "PGPASSWORD="+pass)
	cmd.Stdout = f

	if err := cmd.Run(); err != nil {
		f.Close()
		h.send(msg.Chat.ID, fmt.Sprintf("❌ Ошибка бэкапа: %v", err))
		return
	}
	f.Close()

	doc := tgbotapi.NewDocument(msg.Chat.ID, tgbotapi.FilePath(f.Name()))
	h.api.Send(doc)

	h.send(msg.Chat.ID, "✅ Бэкап готов.")
}

// ============================================================
// Interactive state completions
// ============================================================

func (h *Handler) finishAdd(msg *tgbotapi.Message, userID int64, text string) {
	if text == "" {
		h.states.Reset(userID)
		h.send(msg.Chat.ID, "❌ Текст заметки не может быть пустым.")
		return
	}
	h.clearPrompt(msg.Chat.ID, userID)
	h.clearCmd(msg.Chat.ID, userID)
	h.deleteUserMsg(msg)
	h.doAdd(msg.Chat.ID, userID, text, msg.MessageID)
}

func (h *Handler) finishDelete(msg *tgbotapi.Message, userID int64, text string) {
	h.clearPrompt(msg.Chat.ID, userID)
	h.clearCmd(msg.Chat.ID, userID)
	h.deleteUserMsg(msg)
	h.states.Reset(userID)
	id, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		h.send(msg.Chat.ID, "❌ ID должен быть числом.")
		return
	}
	h.doDelete(msg.Chat.ID, userID, id)
}

func (h *Handler) finishEdit(msg *tgbotapi.Message, userID int64, text string) {
	h.clearPrompt(msg.Chat.ID, userID)
	h.clearCmd(msg.Chat.ID, userID)
	h.deleteUserMsg(msg)
	h.states.Reset(userID)
	parts := strings.SplitN(text, " ", 2)
	if len(parts) < 2 {
		h.send(msg.Chat.ID, "❌ Формат: <id> <текст>")
		return
	}
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		h.send(msg.Chat.ID, "❌ ID должен быть числом")
		return
	}
	h.doEdit(msg.Chat.ID, userID, id, parts[1], msg.MessageID)
}

func (h *Handler) finishEditText(msg *tgbotapi.Message, userID int64, text string) {
	h.clearPrompt(msg.Chat.ID, userID)
	h.deleteUserMsg(msg)
	session := h.states.Get(userID)
	noteID := session.EditNoteID
	h.states.Reset(userID)
	if text == "" {
		h.send(msg.Chat.ID, "❌ Текст не может быть пустым.")
		return
	}
	h.doEdit(msg.Chat.ID, userID, noteID, text, msg.MessageID)
}

func (h *Handler) finishArchive(msg *tgbotapi.Message, userID int64, text string) {
	h.clearPrompt(msg.Chat.ID, userID)
	h.clearCmd(msg.Chat.ID, userID)
	h.deleteUserMsg(msg)
	h.states.Reset(userID)
	id, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		h.send(msg.Chat.ID, "❌ ID должен быть числом.")
		return
	}
	h.doArchive(msg.Chat.ID, userID, id)
}

func (h *Handler) finishNewTopic(msg *tgbotapi.Message, userID int64, text string) {
	h.clearPrompt(msg.Chat.ID, userID)
	h.clearCmd(msg.Chat.ID, userID)
	h.deleteUserMsg(msg)
	h.states.Reset(userID)
	h.doNewTopic(msg.Chat.ID, userID, text)
}

func (h *Handler) finishSetTopic(msg *tgbotapi.Message, userID int64, text string) {
	h.clearPrompt(msg.Chat.ID, userID)
	h.clearCmd(msg.Chat.ID, userID)
	h.deleteUserMsg(msg)
	h.states.Reset(userID)
	id, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		h.send(msg.Chat.ID, "❌ ID должен быть числом.")
		return
	}
	h.doSetTopic(msg.Chat.ID, userID, id)
}

func (h *Handler) finishNewFolder(msg *tgbotapi.Message, userID int64, text string) {
	h.clearPrompt(msg.Chat.ID, userID)
	h.clearCmd(msg.Chat.ID, userID)
	h.deleteUserMsg(msg)
	h.states.Reset(userID)
	h.doNewFolder(msg.Chat.ID, userID, text)
}

// ============================================================
// Action implementations
// ============================================================

func (h *Handler) doAdd(chatID int64, userID int64, text string, userMsgID int) {
	if text == "" {
		h.send(chatID, "❌ Текст заметки не может быть пустым.")
		return
	}

	session := h.states.Get(userID)
	session.State = StateWaitingPriority
	session.PendingNoteText = text
	session.PendingNoteTopicID = session.CurrentTopicID

	if userMsgID != 0 {
		del := tgbotapi.NewDeleteMessage(chatID, userMsgID)
		h.api.Request(del)
	}

	text2, markup := buildPriorityMessage(text)
	msg := h.newMsg(chatID, userID, text2)
	msg.ParseMode = tgbotapi.ModeMarkdown
	msg.ReplyMarkup = markup
	h.api.Send(msg)
}

func (h *Handler) doEdit(chatID int64, userID int64, noteID int64, text string, userMsgID int) {
	if err := h.noteService.EditNote(userID, noteID, text); err != nil {
		h.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
	if userMsgID != 0 {
		del := tgbotapi.NewDeleteMessage(chatID, userMsgID)
		h.api.Request(del)
	}
	h.refreshList(chatID, userID)
}

func (h *Handler) doDelete(chatID int64, userID int64, noteID int64) {
	if err := h.noteService.DeleteNote(userID, noteID); err != nil {
		h.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
	h.refreshList(chatID, userID)
}

func (h *Handler) doArchive(chatID int64, userID int64, noteID int64) {
	if err := h.noteService.ArchiveNote(userID, noteID); err != nil {
		h.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
	h.refreshList(chatID, userID)
}

func (h *Handler) doNewTopic(chatID int64, userID int64, name string) {
	if name == "" {
		h.send(chatID, "❌ Название топика не может быть пустым.")
		return
	}
	if _, err := h.topicService.CreateTopic(userID, name); err != nil {
		h.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
}

func (h *Handler) doNewFolder(chatID int64, userID int64, name string) {
	session := h.states.Get(userID)
	topicID := session.CurrentTopicID

	if topicID == 0 {
		h.send(chatID, "❌ Сначала выберите топик — папки создаются внутри топика.")
		return
	}

	if name == "" {
		h.send(chatID, "❌ Название папки не может быть пустым.")
		return
	}

	if _, err := h.folderService.CreateFolder(userID, topicID, session.CurrentFolderID, name); err != nil {
		h.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
	h.refreshList(chatID, userID)
}

func (h *Handler) doSetTopic(chatID int64, userID int64, topicID int64) {
	session := h.states.Get(userID)
	if topicID != 0 {
		_, err := h.topicService.GetTopic(userID, topicID)
		if err != nil {
			h.send(chatID, fmt.Sprintf("❌ %v", err))
			return
		}
		session.CurrentTopicID = topicID
	} else {
		session.CurrentTopicID = 0
	}
	session.CurrentFolderID = nil // сбрасываем папку при смене топика
	h.showList(chatID, userID)
}

// refreshList обновляет список заметок (in-place, если есть LastListMsgID).
func (h *Handler) refreshList(chatID int64, userID int64) {
	lastMsgID := h.states.Get(userID).LastListMsgID
	if lastMsgID != 0 {
		h.showListPage(chatID, lastMsgID, userID, 0)
	} else {
		h.showList(chatID, userID)
	}
}

// ============================================================
// Callback implementations
// ============================================================

func (h *Handler) callbackSetTopic(chatID int64, msgID int, userID int64, topicID int64) {
	if topicID != 0 {
		_, err := h.topicService.GetTopic(userID, topicID)
		if err != nil {
			h.send(chatID, fmt.Sprintf("❌ %v", err))
			return
		}
		h.states.Get(userID).CurrentTopicID = topicID
	} else {
		h.states.Get(userID).CurrentTopicID = 0
	}
	h.states.Get(userID).CurrentFolderID = nil
	h.states.Get(userID).DoneFolderActive = false
	h.states.Get(userID).LastListMsgID = msgID
	h.showListPage(chatID, msgID, userID, 0)
}

func (h *Handler) callbackViewNote(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	session := h.states.Get(userID)
	session.LastViewedNoteID = note.ID
	session.ExpandedNoteID = 0 // новый просмотр — свёрнутый вид
	tzOffset := session.TimezoneOffset

	text, markup := buildViewNoteMessage(note, false, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)
}

// callbackExpandNote раскрывает дополнительные кнопки действий над заметкой.
func (h *Handler) callbackExpandNote(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	h.states.Get(userID).ExpandedNoteID = noteID
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildViewNoteMessage(note, true, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)
}

// callbackCollapseNote сворачивает дополнительные кнопки действий над заметкой.
func (h *Handler) callbackCollapseNote(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	h.states.Get(userID).ExpandedNoteID = 0
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildViewNoteMessage(note, false, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)
}

func (h *Handler) askDeleteNote(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	text, markup := buildDeleteConfirmMessage(note)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)
}

func (h *Handler) callbackDeleteNote(chatID int64, userID int64, noteID int64) {
	h.doDelete(chatID, userID, noteID)
}

func (h *Handler) callbackArchiveNote(chatID, userID, noteID int64) {
	h.doArchive(chatID, userID, noteID)
}

func (h *Handler) callbackSetPriority(chatID int64, msgID int, userID int64, priority int) {
	session := h.states.Get(userID)
	text := session.PendingNoteText
	topicID := session.PendingNoteTopicID
	folderID := session.CurrentFolderID
	lastMsgID := session.LastListMsgID

	h.states.Reset(userID)

	_, err := h.noteService.AddNote(userID, topicID, folderID, text, priority)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	// Удаляем сообщение с выбором приоритета
	del := tgbotapi.NewDeleteMessage(chatID, msgID)
	h.api.Request(del)

	// Редактируем существующий список (или шлём новый, если не было)
	h.showListPage(chatID, lastMsgID, userID, 0)
}

func (h *Handler) callbackChangePriority(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	// Циклическое переключение: None→Low→Medium→High→None
	newPriority := (note.Priority + 1) % 4
	if err := h.noteService.SetPriority(userID, noteID, newPriority); err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	// Обновляем заметку в памяти для перерисовки
	note.Priority = newPriority

	// Кнопка chprio доступна только в развёрнутом режиме — сохраняем expanded
	session := h.states.Get(userID)
	tzOffset := session.TimezoneOffset
	text, markup := buildViewNoteMessage(note, true, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)

	// Обновляем список в фоне
	lastMsgID := session.LastListMsgID
	if lastMsgID != 0 && lastMsgID != msgID {
		h.showListPage(chatID, lastMsgID, userID, 0)
	}
}

func (h *Handler) callbackMarkDone(chatID int64, msgID int, userID int64, noteID int64) {
	if err := h.noteService.MarkDone(userID, noteID); err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	session := h.states.Get(userID)
	expanded := session.ExpandedNoteID == noteID
	tzOffset := session.TimezoneOffset
	text, markup := buildViewNoteMessage(note, expanded, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)

	// Обновляем список в фоне
	lastMsgID := session.LastListMsgID
	if lastMsgID != 0 && lastMsgID != msgID {
		h.showListPage(chatID, lastMsgID, userID, 0)
	}
}

func (h *Handler) callbackMarkUndone(chatID int64, msgID int, userID int64, noteID int64) {
	if err := h.noteService.MarkUndone(userID, noteID); err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	session := h.states.Get(userID)
	expanded := session.ExpandedNoteID == noteID
	tzOffset := session.TimezoneOffset
	text, markup := buildViewNoteMessage(note, expanded, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)

	// Обновляем список в фоне
	lastMsgID := session.LastListMsgID
	if lastMsgID != 0 && lastMsgID != msgID {
		h.showListPage(chatID, lastMsgID, userID, 0)
	}
}

func (h *Handler) callbackBackToList(chatID int64, msgID int, userID int64) {
	session := h.states.Get(userID)
	session.DoneFolderActive = false
	session.ExpandedNoteID = 0
	h.showListPage(chatID, msgID, userID, 0)
}

// --- Settings ---

func (h *Handler) cmdSettings(msg *tgbotapi.Message, userID int64) {
	h.deleteUserMsg(msg)
	h.showSettings(msg.Chat.ID, h.states.Get(userID).LastListMsgID, userID)
}

func (h *Handler) showSettings(chatID int64, msgID int, userID int64) {
	session := h.states.Get(userID)
	text, markup := buildSettingsMessage(session.ShowCounts, session.BreadcrumbInline, session.ShowKeyboard, session.TimezoneOffset)

	if msgID != 0 {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		edit.ParseMode = tgbotapi.ModeMarkdown
		if _, err := h.api.Send(edit); err == nil || isNotModified(err) {
			return
		}
	}
	msg := h.newMsg(chatID, userID, text)
	msg.ParseMode = tgbotapi.ModeMarkdown
	msg.ReplyMarkup = markup
	sent, err := h.api.Send(msg)
	if err == nil {
		h.states.Get(userID).LastListMsgID = sent.MessageID
	}
}

func (h *Handler) callbackToggleSettings(chatID int64, msgID int, userID int64, key string) {
	session := h.states.Get(userID)
	switch key {
	case "showcounts":
		session.ShowCounts = !session.ShowCounts
	case "breadcrumb":
		session.BreadcrumbInline = !session.BreadcrumbInline
	case "keyboard":
		session.ShowKeyboard = !session.ShowKeyboard
	case "tzminus":
		if session.TimezoneOffset > -2 {
			session.TimezoneOffset--
		}
	case "tzplus":
		if session.TimezoneOffset < 9 {
			session.TimezoneOffset++
		}
	}
	h.showSettings(chatID, msgID, userID)
}

func (h *Handler) callbackOpenFolder(chatID int64, msgID int, userID int64, folderID int64) {
	session := h.states.Get(userID)
	session.CurrentFolderID = &folderID
	h.states.Get(userID).LastListMsgID = msgID
	h.showListPage(chatID, msgID, userID, 0)
}

func (h *Handler) callbackCrumb(chatID int64, msgID int, userID int64, folderID int64) {
	if folderID == 0 {
		// Переход к списку топиков
		h.states.Get(userID).DoneFolderActive = false
		h.cmdTopicsFromList(chatID, msgID, userID)
		return
	}
	session := h.states.Get(userID)
	session.DoneFolderActive = false
	if folderID == -1 {
		// Переход в корень текущего топика
		session.CurrentFolderID = nil
	} else {
		session.CurrentFolderID = &folderID
	}
	h.showListPage(chatID, msgID, userID, 0)
}

func (h *Handler) callbackDoneFolder(chatID int64, msgID int, userID int64) {
	h.states.Get(userID).DoneFolderActive = true
	h.showListPage(chatID, msgID, userID, 0)
}

func (h *Handler) callbackBackFolder(chatID int64, msgID int, userID int64) {
	session := h.states.Get(userID)
	if session.CurrentFolderID == nil {
		// Уже в корне — возвращаемся к списку топиков
		return
	}
	// Поднимаемся на уровень выше: ищем родительскую папку
	currentFolder, err := h.folderService.GetFolder(userID, *session.CurrentFolderID)
	if err != nil {
		session.CurrentFolderID = nil
	} else {
		session.CurrentFolderID = currentFolder.ParentFolderID
	}
	h.showListPage(chatID, msgID, userID, 0)
}

func (h *Handler) callbackAddNote(chatID int64, userID int64) {
	h.states.SetState(userID, StateWaitingAddText)
	h.sendPrompt(chatID, userID, "📝 Введите текст заметки:")
}

// tryNavigateFolder пытается интерпретировать неизвестную команду как имя папки
// и перейти в неё. Используется для кликабельных имён папок в breadcrumb.
func (h *Handler) tryNavigateFolder(msg *tgbotapi.Message, userID int64, cmd string, args string) bool {
	session := h.states.Get(userID)
	if session.CurrentTopicID == 0 {
		return false
	}

	// Ключ для сравнения: команда + аргументы через _ (как в breadcrumb)
	key := strings.ToUpper(cmd)
	if args != "" {
		key = strings.ToUpper(cmd) + "_" + strings.ToUpper(strings.ReplaceAll(args, " ", "_"))
	}

	// matchKey возвращает ключ для сравнения с командой
	matchKey := func(name string) string {
		return strings.ToUpper(sanitize(name))
	}

	// Проверяем имя топика — переход в корень топика
	if t, err := h.topicService.GetTopic(userID, session.CurrentTopicID); err == nil && matchKey(t.Name) == key {
		session.CurrentFolderID = nil
		session.DoneFolderActive = false
		h.deleteUserMsg(msg)
		h.showListPage(msg.Chat.ID, session.LastListMsgID, userID, 0)
		return true
	}

	// Ищем в цепочке папок (breadcrumb)
	if session.CurrentFolderID != nil {
		chain, err := h.folderService.GetFolderChain(*session.CurrentFolderID)
		if err == nil {
			for i, f := range chain {
				if matchKey(f.Name) == key {
					// Последняя в цепочке — текущая папка → на уровень выше
					if i == len(chain)-1 {
						session.CurrentFolderID = f.ParentFolderID
					} else {
						session.CurrentFolderID = &f.ID
					}
					session.DoneFolderActive = false
					h.deleteUserMsg(msg)
					h.showListPage(msg.Chat.ID, session.LastListMsgID, userID, 0)
					return true
				}
			}
		}
	}

	// Ищем среди папок текущего уровня
	folders, err := h.folderService.ListFolders(userID, session.CurrentTopicID, session.CurrentFolderID)
	if err == nil {
		for _, f := range folders {
			if matchKey(f.Name) == key {
				session.CurrentFolderID = &f.ID
				h.deleteUserMsg(msg)
				h.showListPage(msg.Chat.ID, session.LastListMsgID, userID, 0)
				return true
			}
		}
	}

	return false
}

// --- Reminder callbacks ---

func (h *Handler) callbackReminderCalendar(chatID int64, msgID int, userID int64, params string) {
	noteID, year, month := parseReminder3(params)
	if noteID == 0 {
		return
	}
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildCalendar(noteID, year, time.Month(month), tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	h.api.Send(edit)
}

func (h *Handler) callbackReminderDay(chatID int64, msgID int, userID int64, params string) {
	noteID, year, month, day := parseReminder4(params)
	if noteID == 0 {
		return
	}
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildHourPicker(noteID, year, time.Month(month), day, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	h.api.Send(edit)
}

func (h *Handler) callbackReminderHour(chatID int64, msgID int, userID int64, params string) {
	noteID, year, month, day, hour := parseReminder5(params)
	if noteID == 0 {
		return
	}
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildMinuteRangePicker(noteID, year, time.Month(month), day, hour, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	h.api.Send(edit)
}

func (h *Handler) callbackReminderMinuteRange(chatID int64, msgID int, userID int64, params string) {
	noteID, year, month, day, hour, startMin := parseReminder6(params)
	if noteID == 0 {
		return
	}
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildMinuteExactPicker(noteID, year, time.Month(month), day, hour, startMin, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	h.api.Send(edit)
}

func (h *Handler) callbackReminderMinute(chatID int64, msgID int, userID int64, params string) {
	noteID, year, month, day, hour, minute := parseReminder6(params)
	if noteID == 0 {
		return
	}

	tzOffset := h.states.Get(userID).TimezoneOffset
	// Показываем выбор: один раз или каждый день
	text, markup := buildRepeatPicker(noteID, year, time.Month(month), day, hour, minute, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	h.api.Send(edit)
}

func (h *Handler) callbackReminderRepeat(chatID int64, msgID int, userID int64, params string) {
	noteID, year, month, day, hour, minute, repeat := parseReminder7(params)
	if noteID == 0 {
		return
	}

	tzOffset := h.states.Get(userID).TimezoneOffset
	loc := userLocation(tzOffset)

	// Конвертируем пользовательское время в UTC для хранения
	at := time.Date(year, time.Month(month), day, hour, minute, 0, 0, loc).UTC()
	remRepeat := model.ReminderRepeat(repeat)

	// Одноразовое напоминание не может быть в прошлом
	if remRepeat == model.ReminderRepeatOnce && !at.After(now().UTC()) {
		h.callbackAnswer(chatID, msgID, "❌ Время уже прошло, выбери будущее время")
		return
	}

	if err := h.noteService.SetReminder(userID, noteID, at, remRepeat); err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	// Перерисовываем просмотр заметки
	note, _ := h.noteService.GetNote(userID, noteID)
	text, markup := buildViewNoteMessage(note, false, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)

	// Обновляем список
	lastMsgID := h.states.Get(userID).LastListMsgID
	if lastMsgID != 0 && lastMsgID != msgID {
		h.showListPage(chatID, lastMsgID, userID, 0)
	}
}

func (h *Handler) callbackReminderMenu(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildReminderMenu(note, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	h.api.Send(edit)
}

func (h *Handler) callbackClearReminder(chatID int64, msgID int, userID int64, noteID int64) {
	if err := h.noteService.ClearReminder(userID, noteID); err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	note, _ := h.noteService.GetNote(userID, noteID)
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildViewNoteMessage(note, false, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)

	lastMsgID := h.states.Get(userID).LastListMsgID
	if lastMsgID != 0 && lastMsgID != msgID {
		h.showListPage(chatID, lastMsgID, userID, 0)
	}
}

// --- Reminder params parsing helpers ---

// showMoveNavigator отрисовывает навигатор перемещения на основе текущего состояния сессии.
func (h *Handler) showMoveNavigator(chatID int64, msgID int, userID int64) {
	session := h.states.Get(userID)
	note, err := h.noteService.GetNote(userID, session.MoveNoteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	allTopics, _ := h.topicService.ListTopics(userID)
	folders, _ := h.folderService.ListFolders(userID, session.MoveTopicID, session.MoveCurrentFolderID)

	var folderChain []model.Folder
	if session.MoveCurrentFolderID != nil {
		folderChain, _ = h.folderService.GetFolderChain(*session.MoveCurrentFolderID)
	}

	text, markup := buildMoveNavigator(note, session.MoveTopicID, session.MoveCurrentFolderID, folders, folderChain, allTopics)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)
}

// callbackMovePicker инициализирует режим перемещения заметки.
func (h *Handler) callbackMovePicker(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	// Определяем топик заметки (или берём текущий)
	topicID := note.TopicID
	if topicID == 0 {
		topicID = h.states.Get(userID).CurrentTopicID
	}

	allTopics, _ := h.topicService.ListTopics(userID)
	if topicID == 0 && len(allTopics) > 0 {
		topicID = allTopics[0].ID
	}

	// Устанавливаем состояние перемещения
	session := h.states.Get(userID)
	session.MoveNoteID = noteID
	session.MoveTopicID = topicID
	session.MoveCurrentFolderID = nil // начинаем с корня топика

	h.showMoveNavigator(chatID, msgID, userID)
}

// callbackMoveNavigate заходит в папку в режиме перемещения.
func (h *Handler) callbackMoveNavigate(chatID int64, msgID int, userID int64, folderID int64) {
	session := h.states.Get(userID)
	session.MoveCurrentFolderID = &folderID
	h.showMoveNavigator(chatID, msgID, userID)
}

// callbackMoveUp поднимается на уровень выше в режиме перемещения.
func (h *Handler) callbackMoveUp(chatID int64, msgID int, userID int64) {
	session := h.states.Get(userID)
	if session.MoveCurrentFolderID == nil {
		return // уже в корне
	}
	folder, err := h.folderService.GetFolder(userID, *session.MoveCurrentFolderID)
	if err != nil {
		session.MoveCurrentFolderID = nil
	} else {
		session.MoveCurrentFolderID = folder.ParentFolderID
	}
	h.showMoveNavigator(chatID, msgID, userID)
}

// callbackMoveInsert выполняет вставку заметки в текущую позицию навигатора.
func (h *Handler) callbackMoveInsert(chatID int64, msgID int, userID int64) {
	session := h.states.Get(userID)

	if err := h.noteService.MoveNote(userID, session.MoveNoteID, session.MoveTopicID, session.MoveCurrentFolderID); err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	// Сбрасываем состояние перемещения
	session.MoveNoteID = 0
	session.MoveTopicID = 0
	session.MoveCurrentFolderID = nil

	// Перерисовываем список
	h.refreshList(chatID, userID)
}

// callbackMoveTopic переключает топик в режиме перемещения.
func (h *Handler) callbackMoveTopic(chatID int64, msgID int, userID int64, topicID int64) {
	session := h.states.Get(userID)
	session.MoveTopicID = topicID
	session.MoveCurrentFolderID = nil // сбрасываем на корень нового топика
	h.showMoveNavigator(chatID, msgID, userID)
}

// callbackMoveCancel отменяет перемещение и возвращает к просмотру заметки.
func (h *Handler) callbackMoveCancel(chatID int64, msgID int, userID int64, noteID int64) {
	session := h.states.Get(userID)
	session.MoveNoteID = 0
	session.MoveTopicID = 0
	session.MoveCurrentFolderID = nil
	h.callbackViewNote(chatID, msgID, userID, noteID)
}

// --- Reminder params parsing helpers ---

func parseReminder3(params string) (noteID int64, a, b int) {
	parts := strings.Split(params, ":")
	if len(parts) != 3 {
		return 0, 0, 0
	}
	noteID, _ = strconv.ParseInt(parts[0], 10, 64)
	a, _ = strconv.Atoi(parts[1])
	b, _ = strconv.Atoi(parts[2])
	return
}

func parseReminder4(params string) (noteID int64, a, b, c int) {
	parts := strings.Split(params, ":")
	if len(parts) != 4 {
		return 0, 0, 0, 0
	}
	noteID, _ = strconv.ParseInt(parts[0], 10, 64)
	a, _ = strconv.Atoi(parts[1])
	b, _ = strconv.Atoi(parts[2])
	c, _ = strconv.Atoi(parts[3])
	return
}

func parseReminder5(params string) (noteID int64, a, b, c, d int) {
	parts := strings.Split(params, ":")
	if len(parts) != 5 {
		return 0, 0, 0, 0, 0
	}
	noteID, _ = strconv.ParseInt(parts[0], 10, 64)
	a, _ = strconv.Atoi(parts[1])
	b, _ = strconv.Atoi(parts[2])
	c, _ = strconv.Atoi(parts[3])
	d, _ = strconv.Atoi(parts[4])
	return
}

func parseReminder6(params string) (noteID int64, a, b, c, d, e int) {
	parts := strings.Split(params, ":")
	if len(parts) != 6 {
		return 0, 0, 0, 0, 0, 0
	}
	noteID, _ = strconv.ParseInt(parts[0], 10, 64)
	a, _ = strconv.Atoi(parts[1])
	b, _ = strconv.Atoi(parts[2])
	c, _ = strconv.Atoi(parts[3])
	d, _ = strconv.Atoi(parts[4])
	e, _ = strconv.Atoi(parts[5])
	return
}

func parseReminder7(params string) (noteID int64, a, b, c, d, e int, f string) {
	parts := strings.Split(params, ":")
	if len(parts) != 7 {
		return 0, 0, 0, 0, 0, 0, ""
	}
	noteID, _ = strconv.ParseInt(parts[0], 10, 64)
	a, _ = strconv.Atoi(parts[1])
	b, _ = strconv.Atoi(parts[2])
	c, _ = strconv.Atoi(parts[3])
	d, _ = strconv.Atoi(parts[4])
	e, _ = strconv.Atoi(parts[5])
	f = parts[6]
	return
}

// getNoteOwner возвращает userID владельца заметки.
func (h *Handler) getNoteOwner(noteID int64) (int64, error) {
	note, err := h.noteService.GetNoteByID(noteID)
	if err != nil {
		return 0, err
	}
	return note.UserID, nil
}

func (h *Handler) showArchived(chatID int64, msgID int, userID int64) {
	notes, err := h.noteService.ListArchived(userID)
	if err != nil {
		if msgID != 0 {
			h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		} else {
			h.send(chatID, fmt.Sprintf("❌ %v", err))
		}
		return
	}

	text, markup := buildArchivedMessage(notes)

	if msgID != 0 {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		if _, err := h.api.Send(edit); err == nil {
			return
		} else if isNotModified(err) {
			return
		}
	}
	msg2 := h.newMsg(chatID, userID, text)
	msg2.ReplyMarkup = markup
	sent, err := h.api.Send(msg2)
	if err == nil {
		h.states.Get(userID).LastListMsgID = sent.MessageID
	}
}

func (h *Handler) doUnarchive(chatID int64, msgID int, userID int64, noteID int64) {
	if err := h.noteService.UnarchiveNote(userID, noteID); err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	h.showArchived(chatID, msgID, userID)
	lastMsgID := h.states.Get(userID).LastListMsgID
	if lastMsgID != 0 && lastMsgID != msgID {
		h.showListPage(chatID, lastMsgID, userID, 0)
	}
}

// isNotModified возвращает true, если ошибка означает "сообщение не изменилось".
func isNotModified(err error) bool {
	return err != nil && strings.Contains(err.Error(), "not modified")
}

func (h *Handler) callbackAnswer(chatID int64, msgID int, text string) {
	edit := tgbotapi.NewEditMessageText(chatID, msgID, text)
	h.api.Send(edit)
}

// ============================================================
// Helpers
// ============================================================

func (h *Handler) registerCommands() error {
	cmds := []tgbotapi.BotCommand{
		{Command: "start", Description: "Начать"},
		{Command: "list", Description: "Список"},
		{Command: "topics", Description: "Список топиков"},
		{Command: "newfolder", Description: "Создать папку"},
		{Command: "settings", Description: "Настройки"},
		{Command: "archived", Description: "Архив заметок"},
		{Command: "backup", Description: "Скачать бэкап базы"},
		{Command: "help", Description: "Помощь"},
	}
	setCmd := tgbotapi.NewSetMyCommands(cmds...)
	_, err := h.api.Request(setCmd)
	return err
}

func (h *Handler) newMsg(chatID int64, userID int64, text string) tgbotapi.MessageConfig {
	msg := tgbotapi.NewMessage(chatID, text)
	if h.states.Get(userID).ShowKeyboard {
		msg.ReplyMarkup = replyKeyboard()
	}
	return msg
}

func (h *Handler) send(chatID int64, text string) {
	h.api.Send(h.newMsg(chatID, 0, text))
}

// sendPrompt отправляет сообщение-подсказку и сохраняет его ID для последующего удаления.
func (h *Handler) sendPrompt(chatID int64, userID int64, text string) {
	msg := h.newMsg(chatID, userID, text)
	sent, err := h.api.Send(msg)
	if err == nil {
		h.states.Get(userID).PromptMsgID = sent.MessageID
	}
}

// clearPrompt удаляет сохранённое сообщение-подсказку.
func (h *Handler) clearPrompt(chatID int64, userID int64) {
	if promptID := h.states.Get(userID).PromptMsgID; promptID != 0 {
		del := tgbotapi.NewDeleteMessage(chatID, promptID)
		h.api.Request(del)
		h.states.Get(userID).PromptMsgID = 0
	}
}

// clearCmd удаляет сохранённое сообщение-команду.
func (h *Handler) clearCmd(chatID int64, userID int64) {
	if cmdID := h.states.Get(userID).PendingCmdMsgID; cmdID != 0 {
		del := tgbotapi.NewDeleteMessage(chatID, cmdID)
		h.api.Request(del)
		h.states.Get(userID).PendingCmdMsgID = 0
	}
}

func (h *Handler) sendReply(chatID int64, userID int64, text string) {
	msg := tgbotapi.NewMessage(chatID, text)
	h.api.Send(msg)
}

func (h *Handler) deleteUserMsg(msg *tgbotapi.Message) {
	if msg == nil {
		return
	}
	del := tgbotapi.NewDeleteMessage(msg.Chat.ID, msg.MessageID)
	h.api.Request(del)
}

func (h *Handler) deleteLastBotMsg(chatID int64, userID int64) {
	lastMsgID := h.states.Get(userID).LastListMsgID
	if lastMsgID != 0 {
		del := tgbotapi.NewDeleteMessage(chatID, lastMsgID)
		h.api.Request(del)
		h.states.Get(userID).LastListMsgID = 0
	}
}

// --- URL parser (для бэкапа) ---

type dbURLInfo struct {
	host, user, pass, dbname string
}

func parseURL(rawURL string) (dbURLInfo, error) {
	// Простой парсер для [MASKED]
	s := rawURL
	// postgres://user:pass@host:port/dbname?sslmode=disable
	s = strings.TrimPrefix(s, "postgres://")
	s = strings.TrimPrefix(s, "postgresql://")

	// user:pass@host:port/dbname?...
	atIdx := strings.LastIndex(s, "@")
	if atIdx == -1 {
		return dbURLInfo{}, fmt.Errorf("некорректный URL")
	}

	userPart := s[:atIdx]
	hostPart := s[atIdx+1:]

	colonIdx := strings.Index(userPart, ":")
	user, pass := userPart, ""
	if colonIdx != -1 {
		user = userPart[:colonIdx]
		pass = userPart[colonIdx+1:]
	}

	slashIdx := strings.Index(hostPart, "/")
	host, dbname := hostPart, "todobot"
	if slashIdx != -1 {
		host = hostPart[:slashIdx]
		dbname = hostPart[slashIdx+1:]
	}

	// Убираем параметры из dbname
	if qIdx := strings.Index(dbname, "?"); qIdx != -1 {
		dbname = dbname[:qIdx]
	}

	// Убираем порт из host
	if colonIdx2 := strings.Index(host, ":"); colonIdx2 != -1 {
		host = host[:colonIdx2]
	}

	return dbURLInfo{host: host, user: user, pass: pass, dbname: dbname}, nil
}
