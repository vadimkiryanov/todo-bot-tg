package telegram

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"

	"todo-bot-tg/internal/model"
)

// NoteService — интерфейс сервиса заметок (определён потребителем — handler'ом).
type NoteService interface {
	AddNote(userID, topicID int64, text string) (model.Note, error)
	ListNotes(userID, topicID int64) ([]model.Note, error)
	GetNote(userID, noteID int64) (model.Note, error)
	EditNote(userID, noteID int64, text string) error
	DeleteNote(userID, noteID int64) error
	ArchiveNote(userID, noteID int64) error
	UnarchiveNote(userID, noteID int64) error
	CountNotes(userID, topicID int64) (int, error)
	ListArchived(userID int64) ([]model.Note, error)
	CountArchived(userID int64) (int, error)
	SeedDefaults(userID int64) error
}

// TopicService — интерфейс сервиса топиков (определён потребителем — handler'ом).
type TopicService interface {
	CreateTopic(userID int64, name string) (model.Topic, error)
	ListTopics(userID int64) ([]model.Topic, error)
	GetTopic(userID, topicID int64) (model.Topic, error)
	DeleteTopic(userID, topicID int64) error
}

// Handler — обработчик обновлений Telegram.
type Handler struct {
	api          *tgbotapi.BotAPI
	noteService  NoteService
	topicService TopicService
	states       *StateManager
	selfUsername string // @-имя бота для обрезки SwitchInlineQuery
}

// NewHandler создаёт новый Handler.
func NewHandler(token string, noteService NoteService, topicService TopicService) (*Handler, error) {
	api, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return nil, fmt.Errorf("ошибка подключения к Telegram API: %w", err)
	}

	h := &Handler{
		api:          api,
		noteService:  noteService,
		topicService: topicService,
		states:       NewStateManager(),
		selfUsername: "@" + api.Self.UserName,
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

// --- Commands ---

func (h *Handler) handleCommand(msg *tgbotapi.Message) {
	userID := msg.From.ID
	cmd := msg.Command()
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
		h.deleteLastBotMsg(msg.Chat.ID, userID)
		h.showArchived(msg.Chat.ID, 0, userID)
	default:
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

	kbd := h.newMsg(msg.Chat.ID, "👋 Выбери действие:")
	h.api.Send(kbd)
}

func (h *Handler) cmdHelp(msg *tgbotapi.Message) {
	h.deleteUserMsg(msg)

	text, markup := buildHelpMessage()
	msg2 := h.newMsg(msg.Chat.ID, text)
	msg2.ParseMode = tgbotapi.ModeMarkdown
	msg2.ReplyMarkup = markup
	h.api.Send(msg2)
}

// --- Topics ---

func (h *Handler) cmdTopics(msg *tgbotapi.Message, userID int64) {
	h.deleteUserMsg(msg)
	h.deleteLastBotMsg(msg.Chat.ID, userID)
	h.showTopics(msg.Chat.ID, 0, userID)
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
		if msgID == 0 {
			h.send(chatID, text)
		} else {
			edit := tgbotapi.NewEditMessageText(chatID, msgID, text)
			h.api.Send(edit)
		}
		return
	}

	counts := make(map[int64]int)
	for _, t := range topics {
		c, _ := h.noteService.CountNotes(userID, t.ID)
		counts[t.ID] = c
	}

	text, markup := buildTopicsMessage(topics, currentID, userID, counts)

	if msgID == 0 {
		msg := h.newMsg(chatID, text)
		msg.ParseMode = tgbotapi.ModeMarkdown
		msg.ReplyMarkup = markup
		sent, err := h.api.Send(msg)
		if err == nil {
			h.states.Get(userID).LastListMsgID = sent.MessageID
		}
	} else {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		edit.ParseMode = tgbotapi.ModeMarkdown
		h.api.Send(edit)
	}
}

func (h *Handler) cmdNewTopic(msg *tgbotapi.Message, userID int64, args string) {
	name := strings.TrimSpace(args)
	if name == "" {
		h.states.SetState(userID, StateWaitingNewTopic)
		h.send(msg.Chat.ID, "📂 Введите название нового топика:")
		return
	}
	h.doNewTopic(msg.Chat.ID, userID, name)
}

func (h *Handler) cmdSetTopic(msg *tgbotapi.Message, userID int64, args string) {
	idStr := strings.TrimSpace(args)
	if idStr == "" {
		h.states.SetState(userID, StateWaitingSetTopic)
		h.send(msg.Chat.ID, "📂 Введите ID топика (можно посмотреть в /topics):")
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
		h.states.SetState(userID, StateWaitingAddText)
		h.send(msg.Chat.ID, "📝 Введите текст заметки:")
		return
	}
	h.doAdd(msg.Chat.ID, userID, text, msg.MessageID)
}

func (h *Handler) cmdList(msg *tgbotapi.Message, userID int64) {
	h.deleteUserMsg(msg)
	h.deleteLastBotMsg(msg.Chat.ID, userID)
	h.showList(msg.Chat.ID, userID)
}

func (h *Handler) showList(chatID int64, userID int64) {
	h.showListPage(chatID, 0, userID, 0)
}

func (h *Handler) showListPage(chatID int64, msgID int, userID int64, page int) {
	const perPage = 10
	session := h.states.Get(userID)
	topicID := session.CurrentTopicID
	notes, err := h.noteService.ListNotes(userID, topicID)
	if err != nil {
		h.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}

	header := fmt.Sprintf("📝 Все · %d", len(notes))
	if topicID != 0 {
		t, err := h.topicService.GetTopic(userID, topicID)
		if err == nil {
			header = fmt.Sprintf("%s · %d", t.Name, len(notes))
		}
	}

	totalPages := (len(notes) + perPage - 1) / perPage
	if totalPages == 0 {
		totalPages = 1
	}
	if page < 0 {
		page = 0
	}
	if page >= totalPages {
		page = totalPages - 1
	}

	emptyText := header + "\n\n📭 Пусто"
	if len(notes) == 0 {
		if msgID == 0 {
			msg := h.newMsg(chatID, emptyText)
			sent, err := h.api.Send(msg)
			if err == nil {
				h.states.Get(userID).LastListMsgID = sent.MessageID
			}
		} else {
			edit := tgbotapi.NewEditMessageText(chatID, msgID, emptyText)
			h.api.Send(edit)
		}
		return
	}

	start := page * perPage
	end := start + perPage
	if end > len(notes) {
		end = len(notes)
	}
	pageNotes := notes[start:end]

	text, markup := buildListMessage(pageNotes, header, topicID, page, totalPages)

	if msgID == 0 {
		msg2 := tgbotapi.NewMessage(chatID, text)
		msg2.ReplyMarkup = markup
		sent, err := h.api.Send(msg2)
		if err == nil {
			h.states.Get(userID).LastListMsgID = sent.MessageID
		}
	} else {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		h.api.Send(edit)
	}
}

func (h *Handler) cmdEdit(msg *tgbotapi.Message, userID int64, args string) {
	args = strings.TrimSpace(args)
	if args == "" {
		h.states.SetState(userID, StateWaitingEditArgs)
		h.send(msg.Chat.ID, "✏️ Введите ID заметки и новый текст:\n`<id> <текст>`")
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
		h.states.SetState(userID, StateWaitingDeleteID)
		h.send(msg.Chat.ID, "🗑 Введите ID заметки для удаления:")
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
		h.states.SetState(userID, StateWaitingArchiveID)
		h.send(msg.Chat.ID, "📦 Введите ID заметки для архивации:")
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
	h.states.Reset(userID)
	if text == "" {
		h.send(msg.Chat.ID, "❌ Текст заметки не может быть пустым.")
		return
	}
	h.doAdd(msg.Chat.ID, userID, text, msg.MessageID)
}

func (h *Handler) finishDelete(msg *tgbotapi.Message, userID int64, text string) {
	h.states.Reset(userID)
	id, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		h.send(msg.Chat.ID, "❌ ID должен быть числом.")
		return
	}
	h.doDelete(msg.Chat.ID, userID, id)
}

func (h *Handler) finishEdit(msg *tgbotapi.Message, userID int64, text string) {
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
	h.states.Reset(userID)
	id, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		h.send(msg.Chat.ID, "❌ ID должен быть числом.")
		return
	}
	h.doArchive(msg.Chat.ID, userID, id)
}

func (h *Handler) finishNewTopic(msg *tgbotapi.Message, userID int64, text string) {
	h.states.Reset(userID)
	h.doNewTopic(msg.Chat.ID, userID, text)
}

func (h *Handler) finishSetTopic(msg *tgbotapi.Message, userID int64, text string) {
	h.states.Reset(userID)
	id, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		h.send(msg.Chat.ID, "❌ ID должен быть числом.")
		return
	}
	h.doSetTopic(msg.Chat.ID, userID, id)
}

// ============================================================
// Action implementations
// ============================================================

func (h *Handler) doAdd(chatID int64, userID int64, text string, userMsgID int) {
	topicID := h.states.Get(userID).CurrentTopicID
	_, err := h.noteService.AddNote(userID, topicID, text)
	if err != nil {
		h.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}

	if userMsgID != 0 {
		del := tgbotapi.NewDeleteMessage(chatID, userMsgID)
		h.api.Request(del)
	}

	h.refreshList(chatID, userID)
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
	t, err := h.topicService.CreateTopic(userID, name)
	if err != nil {
		h.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
	h.send(chatID, fmt.Sprintf("📂 Топик «%s» создан (#%d).", t.Name, t.ID))
}

func (h *Handler) doSetTopic(chatID int64, userID int64, topicID int64) {
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
	h.callbackAnswer(chatID, msgID, "✅")
	del := tgbotapi.NewDeleteMessage(chatID, msgID)
	h.api.Request(del)
	h.doSetTopic(chatID, userID, topicID)
}

func (h *Handler) callbackViewNote(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	h.states.Get(userID).LastViewedNoteID = note.ID

	text, markup := buildViewNoteMessage(note)
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

func (h *Handler) callbackBackToList(chatID int64, msgID int, userID int64) {
	h.showListPage(chatID, msgID, userID, 0)
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

	if msgID == 0 {
		msg2 := h.newMsg(chatID, text)
		msg2.ReplyMarkup = markup
		sent, err := h.api.Send(msg2)
		if err == nil {
			h.states.Get(userID).LastListMsgID = sent.MessageID
		}
	} else {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		h.api.Send(edit)
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
		{Command: "archived", Description: "Архив заметок"},
		{Command: "backup", Description: "Скачать бэкап базы"},
	}
	setCmd := tgbotapi.NewSetMyCommands(cmds...)
	_, err := h.api.Request(setCmd)
	return err
}

func (h *Handler) newMsg(chatID int64, text string) tgbotapi.MessageConfig {
	msg := tgbotapi.NewMessage(chatID, text)
	msg.ReplyMarkup = replyKeyboard()
	return msg
}

func (h *Handler) send(chatID int64, text string) {
	h.api.Send(h.newMsg(chatID, text))
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
