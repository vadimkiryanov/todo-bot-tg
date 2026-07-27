package bot

import (
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"todo-bot-tg/store"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

// Bot — телеграм-бот для управления заметками.
type Bot struct {
	api          *tgbotapi.BotAPI
	store        store.Store
	states       *StateManager
	selfUsername string // @-имя бота для обрезки SwitchInlineQuery
}

// New создаёт нового бота.
func New(token string, s store.Store) (*Bot, error) {
	api, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return nil, fmt.Errorf("ошибка подключения к Telegram API: %w", err)
	}

	bot := &Bot{api: api, store: s, states: NewStateManager(), selfUsername: "@" + api.Self.UserName}

	// Регистрируем команды для автодополнения (меню при вводе /)
	if err := bot.registerCommands(); err != nil {
		return nil, fmt.Errorf("ошибка регистрации команд: %w", err)
	}

	return bot, nil
}

// Run запускает обработку обновлений.
func (b *Bot) Run() error {
	u := tgbotapi.NewUpdate(0)
	u.Timeout = 60
	updates := b.api.GetUpdatesChan(u)

	for update := range updates {
		if update.CallbackQuery != nil {
			b.handleCallback(update.CallbackQuery)
			continue
		}
		if update.Message == nil {
			continue
		}
		if update.Message.IsCommand() {
			b.handleCommand(update.Message)
		} else {
			b.handleMessage(update.Message)
		}
	}
	return nil
}

// --- Commands ---

func (b *Bot) handleCommand(msg *tgbotapi.Message) {
	userID := msg.From.ID
	cmd := msg.Command()
	args := msg.CommandArguments()

	// Любая команда сбрасывает состояние ожидания
	b.states.Reset(userID)

	switch cmd {
	case "start":
		b.cmdStart(msg)
	case "help":
		b.cmdHelp(msg)
	case "topics":
		b.cmdTopics(msg, userID)
	case "newtopic":
		b.cmdNewTopic(msg, userID, args)
	case "settopic":
		b.cmdSetTopic(msg, userID, args)
	case "deltopic":
		b.cmdDelTopic(msg, userID, args)
	case "list":
		b.cmdList(msg, userID)
	case "add":
		b.cmdAdd(msg, userID, args)
	case "edit":
		b.cmdEdit(msg, userID, args)
	case "delete":
		b.cmdDelete(msg, userID, args)
	case "archive":
		b.cmdArchive(msg, userID, args)
	case "backup":
		b.cmdBackup(msg)
	case "archived":
		b.deleteUserMsg(msg)
		b.showArchived(msg.Chat.ID, 0, userID)
	default:
		b.send(msg.Chat.ID, "Неизвестная команда. Введите /help для списка команд.")
	}
}

// --- Messages (interactive state) ---

func (b *Bot) handleMessage(msg *tgbotapi.Message) {
	userID := msg.From.ID
	s := b.states.Get(userID)
	text := strings.TrimSpace(msg.Text)

	switch s.State {
	case StateWaitingAddText:
		b.finishAdd(msg, userID, text)
	case StateWaitingDeleteID:
		b.finishDelete(msg, userID, text)
	case StateWaitingEditArgs:
		b.finishEdit(msg, userID, text)
	case StateWaitingEditText:
		b.finishEditText(msg, userID, text)
	case StateWaitingArchiveID:
		b.finishArchive(msg, userID, text)
	case StateWaitingNewTopic:
		b.finishNewTopic(msg, userID, text)
	case StateWaitingSetTopic:
		b.finishSetTopic(msg, userID, text)
	default:
		// Обрезаем @bot_username из SwitchInlineQuery (первая строка)
		if idx := strings.Index(text, "\n"); idx != -1 {
			firstLine := text[:idx]
			if strings.TrimSpace(firstLine) == b.selfUsername {
				text = strings.TrimSpace(text[idx+1:])
				b.handleCommandText(msg, userID, text)
				return
			}
		}

		// Обрабатываем нажатия reply-клавиатуры
		switch {
		case text == "📝 Список":
			b.cmdList(msg, userID)
		case text == "📂 Топики":
			b.cmdTopics(msg, userID)
		default:
			// Idle — любое сообщение = добавление заметки
			b.doAdd(msg.Chat.ID, userID, text, msg.MessageID)
		}
	}
}

// --- Callbacks (inline buttons) ---

func (b *Bot) handleCallback(cb *tgbotapi.CallbackQuery) {
	userID := cb.From.ID
	data := cb.Data
	chatID := cb.Message.Chat.ID
	msgID := cb.Message.MessageID

	// Подтверждаем callback
	b.api.Request(tgbotapi.NewCallback(cb.ID, ""))

	// "backtolist" — без ID
	if data == "backtolist" {
		b.callbackBackToList(chatID, msgID, userID)
		return
	}

	parts := strings.SplitN(data, ":", 2)
	if len(parts) != 2 {
		b.callbackAnswer(chatID, msgID, "")
		return
	}
	action, idStr := parts[0], parts[1]

	switch action {
	case "settopic":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		b.callbackSetTopic(chatID, msgID, userID, id)
	case "view":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		b.callbackViewNote(chatID, msgID, userID, id)
	case "delnote":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		b.callbackDeleteNote(chatID, userID, id)
	case "askdel":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		b.askDeleteNote(chatID, msgID, userID, id)
	case "confdel":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		b.doDelete(chatID, userID, id)
	case "archnote":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		b.callbackArchiveNote(chatID, userID, id)
	case "page":
		// Формат: page:<topicID>:<page>
		subParts := strings.SplitN(idStr, ":", 2)
		if len(subParts) == 2 {
			page, err := strconv.Atoi(subParts[1])
			if err == nil {
				b.showListPage(chatID, msgID, userID, page)
			}
		}
	case "topics":
		b.cmdTopicsFromList(chatID, msgID, userID)
	case "archived":
		b.showArchived(chatID, msgID, userID)
	case "unarch":
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return
		}
		b.doUnarchive(chatID, msgID, userID, id)
	}
}

// ============================================================
// Command implementations
// ============================================================

func (b *Bot) cmdStart(msg *tgbotapi.Message) {
	userID := msg.From.ID
	b.deleteUserMsg(msg)
	b.ensureKeyboard(msg.Chat.ID)
	b.showList(msg.Chat.ID, userID)
}

func (b *Bot) ensureKeyboard(chatID int64) {
	kbd := tgbotapi.NewMessage(chatID, "📝 Быстрые действия")
	kbd.ReplyMarkup = b.replyKeyboard()
	b.api.Send(kbd)
}

func (b *Bot) cmdHelp(msg *tgbotapi.Message) {
	b.deleteUserMsg(msg)

	listBtn := tgbotapi.NewInlineKeyboardButtonData("📝 Список", "backtolist")
	topicsBtn := tgbotapi.NewInlineKeyboardButtonData("📂 Топики", "topics:0")
	archivedBtn := tgbotapi.NewInlineKeyboardButtonData("📦 Архив", "archived:0")

	text := "📋 *Справка*\n\nВыберите действие или используйте команды:"
	markup := tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(listBtn),
		tgbotapi.NewInlineKeyboardRow(topicsBtn),
		tgbotapi.NewInlineKeyboardRow(archivedBtn),
	)
	msg2 := b.newMsg(msg.Chat.ID, text)
	msg2.ParseMode = tgbotapi.ModeMarkdown
	msg2.ReplyMarkup = markup
	b.api.Send(msg2)
}

// --- Topics ---

func (b *Bot) cmdTopics(msg *tgbotapi.Message, userID int64) {
	b.deleteUserMsg(msg)
	b.showTopics(msg.Chat.ID, 0, userID)
}

// cmdTopicsFromList редактирует текущее сообщение в список топиков (из кнопки в списке).
func (b *Bot) cmdTopicsFromList(chatID int64, msgID int, userID int64) {
	b.showTopics(chatID, msgID, userID)
}

// showTopics отправляет/редактирует список топиков.
func (b *Bot) showTopics(chatID int64, msgID int, userID int64) {
	currentID := b.states.Get(userID).CurrentTopicID
	topics, err := b.store.ListTopics(userID)
	if err != nil {
		b.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}

	var rows [][]tgbotapi.InlineKeyboardButton

	allCount, _ := b.store.CountNotes(userID, 0)
	allPrefix := "  "
	if currentID == 0 {
		allPrefix = "✅ "
	}
	rows = append(rows, tgbotapi.NewInlineKeyboardRow(
		tgbotapi.NewInlineKeyboardButtonData(
			fmt.Sprintf("%s📂 Все (%d)", allPrefix, allCount),
			"settopic:0",
		),
	))

	for _, t := range topics {
		count, _ := b.store.CountNotes(userID, t.ID)
		prefix := "  "
		if t.ID == currentID {
			prefix = "✅ "
		}
		label := fmt.Sprintf("%s%s (%d)", prefix, t.Name, count)
		rows = append(rows, tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData(label, fmt.Sprintf("settopic:%d", t.ID)),
		))
	}

	if len(rows) == 0 {
		if msgID == 0 {
			b.send(chatID, "📂 Топиков пока нет. Создайте новый: /newtopic <название>")
		} else {
			edit := tgbotapi.NewEditMessageText(chatID, msgID, "📂 Топиков пока нет. Создайте новый: /newtopic <название>")
			b.api.Send(edit)
		}
		return
	}

	text := "📂 *Топики*"
	markup := tgbotapi.NewInlineKeyboardMarkup(rows...)

	if msgID == 0 {
		msg := b.newMsg(chatID, text)
		msg.ParseMode = tgbotapi.ModeMarkdown
		msg.ReplyMarkup = markup
		b.api.Send(msg)
	} else {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		edit.ParseMode = tgbotapi.ModeMarkdown
		b.api.Send(edit)
	}
}

func (b *Bot) cmdNewTopic(msg *tgbotapi.Message, userID int64, args string) {
	name := strings.TrimSpace(args)
	if name == "" {
		b.states.SetState(userID, StateWaitingNewTopic)
		b.send(msg.Chat.ID, "📂 Введите название нового топика:")
		return
	}
	b.doNewTopic(msg.Chat.ID, userID, name)
}

func (b *Bot) cmdSetTopic(msg *tgbotapi.Message, userID int64, args string) {
	idStr := strings.TrimSpace(args)
	if idStr == "" {
		b.states.SetState(userID, StateWaitingSetTopic)
		b.send(msg.Chat.ID, "📂 Введите ID топика (можно посмотреть в /topics):")
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		b.send(msg.Chat.ID, "❌ ID должен быть числом")
		return
	}
	b.doSetTopic(msg.Chat.ID, userID, id)
}

func (b *Bot) cmdDelTopic(msg *tgbotapi.Message, userID int64, args string) {
	id, err := strconv.ParseInt(strings.TrimSpace(args), 10, 64)
	if err != nil {
		b.send(msg.Chat.ID, "❌ Формат: /deltopic <id>")
		return
	}
	if err := b.store.DeleteTopic(userID, id); err != nil {
		b.send(msg.Chat.ID, fmt.Sprintf("❌ %v", err))
		return
	}

	// Сбрасываем текущий топик, если удалён он
	session := b.states.Get(userID)
	if session.CurrentTopicID == id {
		session.CurrentTopicID = 0
	}
	b.sendReply(msg.Chat.ID, userID, fmt.Sprintf("🗑 Топик #%d удалён вместе с заметками.", id))
}

// --- Notes ---

func (b *Bot) cmdAdd(msg *tgbotapi.Message, userID int64, args string) {
	text := strings.TrimSpace(args)
	if text == "" {
		b.states.SetState(userID, StateWaitingAddText)
		b.send(msg.Chat.ID, "📝 Введите текст заметки:")
		return
	}
	b.doAdd(msg.Chat.ID, userID, text, msg.MessageID)
}

func (b *Bot) cmdList(msg *tgbotapi.Message, userID int64) {
	b.deleteUserMsg(msg)
	b.showList(msg.Chat.ID, userID)
}

// showList отправляет список заметок в чат (первая страница).
func (b *Bot) showList(chatID int64, userID int64) {
	b.showListPage(chatID, 0, userID, 0)
}

// showListPage отправляет/редактирует список заметок с пагинацией.
// msgID == 0 — новое сообщение, иначе редактируем существующее.
func (b *Bot) showListPage(chatID int64, msgID int, userID int64, page int) {
	const perPage = 10
	session := b.states.Get(userID)
	topicID := session.CurrentTopicID
	notes, err := b.store.List(userID, topicID)
	if err != nil {
		b.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}

	header := fmt.Sprintf("📝 Все заметки (%d):", len(notes))
	if topicID != 0 {
		t, err := b.store.GetTopic(userID, topicID)
		if err == nil {
			header = fmt.Sprintf("📝 Заметки в «%s» (%d):", t.Name, len(notes))
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

	if len(notes) == 0 {
		topicLabel := "📂 Все топики"
		if topicID != 0 {
			t, err := b.store.GetTopic(userID, topicID)
			if err == nil {
				topicLabel = fmt.Sprintf("📂 %s", t.Name)
			}
		}
		topicBtn := tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData(topicLabel, "topics:0"),
		)
		markup := tgbotapi.NewInlineKeyboardMarkup(topicBtn)
		if msgID == 0 {
			msg := tgbotapi.NewMessage(chatID, header+"\n\n📭 Пусто.")
			msg.ReplyMarkup = markup
			sent, err := b.api.Send(msg)
			if err == nil {
				b.states.Get(userID).LastListMsgID = sent.MessageID
			}
		} else {
			edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, header+"\n\n📭 Пусто.", markup)
			b.api.Send(edit)
		}
		return
	}

	start := page * perPage
	end := start + perPage
	if end > len(notes) {
		end = len(notes)
	}
	pageNotes := notes[start:end]

	text, markup := b.buildListMessage(pageNotes, header, userID, topicID, page, totalPages)

	if msgID == 0 {
		msg2 := tgbotapi.NewMessage(chatID, text)
		msg2.ReplyMarkup = markup
		sent, err := b.api.Send(msg2)
		if err == nil {
			b.states.Get(userID).LastListMsgID = sent.MessageID
		}
	} else {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		b.api.Send(edit)
	}
}

// buildListMessage строит текст и разметку для списка заметок.
func (b *Bot) buildListMessage(notes []store.Note, header string, userID int64, topicID int64, page, totalPages int) (string, tgbotapi.InlineKeyboardMarkup) {
	var btnRows [][]tgbotapi.InlineKeyboardButton

	for _, n := range notes {
		label := formatPreview(n.Text, 50, 1)
		if label == "" {
			label = "..."
		}
		btn := tgbotapi.NewInlineKeyboardButtonData(
			label,
			fmt.Sprintf("view:%d", n.ID),
		)
		btnRows = append(btnRows, tgbotapi.NewInlineKeyboardRow(btn))
	}

	// Кнопка топика — переключает или показывает статус
	var topicLabel string
	if topicID == 0 {
		topicLabel = "📂 Все топики"
	} else {
		t, err := b.store.GetTopic(userID, topicID)
		if err == nil {
			topicLabel = fmt.Sprintf("📂 %s", t.Name)
		} else {
			topicLabel = "📂 Топик"
		}
	}
	topicBtn := tgbotapi.NewInlineKeyboardButtonData(topicLabel, "topics:0")
	btnRows = append(btnRows, tgbotapi.NewInlineKeyboardRow(topicBtn))

	// Кнопка архива
	archivedCount, err := b.store.CountArchived(userID)
	if err == nil && archivedCount > 0 {
		archBtn := tgbotapi.NewInlineKeyboardButtonData(
			fmt.Sprintf("📦 Архив (%d)", archivedCount),
			"archived:0",
		)
		btnRows = append(btnRows, tgbotapi.NewInlineKeyboardRow(archBtn))
	}

	// Пагинация
	if totalPages > 1 {
		var navRow []tgbotapi.InlineKeyboardButton
		if page > 0 {
			navRow = append(navRow, tgbotapi.NewInlineKeyboardButtonData("◀️", fmt.Sprintf("page:%d:%d", topicID, page-1)))
		}
		navRow = append(navRow, tgbotapi.NewInlineKeyboardButtonData(
			fmt.Sprintf("%d/%d", page+1, totalPages),
			"none",
		))
		if page < totalPages-1 {
			navRow = append(navRow, tgbotapi.NewInlineKeyboardButtonData("▶️", fmt.Sprintf("page:%d:%d", topicID, page+1)))
		}
		btnRows = append(btnRows, navRow)
	}

	return header, tgbotapi.NewInlineKeyboardMarkup(btnRows...)
}

func (b *Bot) cmdEdit(msg *tgbotapi.Message, userID int64, args string) {
	args = strings.TrimSpace(args)
	if args == "" {
		b.states.SetState(userID, StateWaitingEditArgs)
		b.send(msg.Chat.ID, "✏️ Введите ID заметки и новый текст:\n`<id> <текст>`")
		return
	}
	parts := strings.SplitN(args, " ", 2)
	if len(parts) < 2 {
		b.send(msg.Chat.ID, "❌ Формат: /edit <id> <текст>")
		return
	}
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		b.send(msg.Chat.ID, "❌ ID должен быть числом")
		return
	}
	b.doEdit(msg.Chat.ID, userID, id, parts[1], msg.MessageID)
}

func (b *Bot) cmdDelete(msg *tgbotapi.Message, userID int64, args string) {
	idStr := strings.TrimSpace(args)
	if idStr == "" {
		b.states.SetState(userID, StateWaitingDeleteID)
		b.send(msg.Chat.ID, "🗑 Введите ID заметки для удаления:")
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		b.send(msg.Chat.ID, "❌ ID должен быть числом")
		return
	}
	b.doDelete(msg.Chat.ID, userID, id)
}

func (b *Bot) cmdArchive(msg *tgbotapi.Message, userID int64, args string) {
	idStr := strings.TrimSpace(args)
	if idStr == "" {
		b.states.SetState(userID, StateWaitingArchiveID)
		b.send(msg.Chat.ID, "📦 Введите ID заметки для архивации:")
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		b.send(msg.Chat.ID, "❌ ID должен быть числом")
		return
	}
	b.doArchive(msg.Chat.ID, userID, id)
}

func (b *Bot) cmdBackup(msg *tgbotapi.Message) {
	b.send(msg.Chat.ID, "⏳ Делаю бэкап...")

	dbURL := os.Getenv("DATABASE_URL")
	// pg_dump принимает отдельные флаги, парсим из URL: postgres://user:pass@host:port/db
	host, user, pass, dbname := "db", "todobot", "todobot", "todobot"
	if u, err := url.Parse(dbURL); err == nil {
		host = u.Hostname()
		if u.Port() != "" {
			host = u.Hostname()
		}
		user = u.User.Username()
		pass, _ = u.User.Password()
		dbname = strings.TrimPrefix(u.Path, "/")
	}

	f, err := os.CreateTemp("", "todobot-backup-*.sql")
	if err != nil {
		b.send(msg.Chat.ID, fmt.Sprintf("❌ Ошибка создания файла: %v", err))
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
		b.send(msg.Chat.ID, fmt.Sprintf("❌ Ошибка бэкапа: %v", err))
		return
	}
	f.Close()

	doc := tgbotapi.NewDocument(msg.Chat.ID, tgbotapi.FilePath(f.Name()))
	b.api.Send(doc)

	b.send(msg.Chat.ID, "✅ Бэкап готов.")
}

// ============================================================
// Interactive state completions
// ============================================================

func (b *Bot) finishAdd(msg *tgbotapi.Message, userID int64, text string) {
	b.states.Reset(userID)
	if text == "" {
		b.send(msg.Chat.ID, "❌ Текст заметки не может быть пустым.")
		return
	}
	b.doAdd(msg.Chat.ID, userID, text, msg.MessageID)
}

func (b *Bot) finishDelete(msg *tgbotapi.Message, userID int64, text string) {
	b.states.Reset(userID)
	id, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		b.send(msg.Chat.ID, "❌ ID должен быть числом.")
		return
	}
	b.doDelete(msg.Chat.ID, userID, id)
}

func (b *Bot) finishEdit(msg *tgbotapi.Message, userID int64, text string) {
	b.states.Reset(userID)
	parts := strings.SplitN(text, " ", 2)
	if len(parts) < 2 {
		b.send(msg.Chat.ID, "❌ Формат: <id> <текст>")
		return
	}
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		b.send(msg.Chat.ID, "❌ ID должен быть числом")
		return
	}
	b.doEdit(msg.Chat.ID, userID, id, parts[1], msg.MessageID)
}

func (b *Bot) finishArchive(msg *tgbotapi.Message, userID int64, text string) {
	b.states.Reset(userID)
	id, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		b.send(msg.Chat.ID, "❌ ID должен быть числом.")
		return
	}
	b.doArchive(msg.Chat.ID, userID, id)
}

func (b *Bot) finishNewTopic(msg *tgbotapi.Message, userID int64, text string) {
	b.states.Reset(userID)
	b.doNewTopic(msg.Chat.ID, userID, text)
}

func (b *Bot) finishEditText(msg *tgbotapi.Message, userID int64, text string) {
	session := b.states.Get(userID)
	noteID := session.EditNoteID
	b.states.Reset(userID)
	if text == "" {
		b.send(msg.Chat.ID, "❌ Текст не может быть пустым.")
		return
	}
	b.doEdit(msg.Chat.ID, userID, noteID, text, msg.MessageID)
}

func (b *Bot) finishSetTopic(msg *tgbotapi.Message, userID int64, text string) {
	b.states.Reset(userID)
	id, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		b.send(msg.Chat.ID, "❌ ID должен быть числом.")
		return
	}
	b.doSetTopic(msg.Chat.ID, userID, id)
}

// ============================================================
// Action implementations
// ============================================================

func (b *Bot) doAdd(chatID int64, userID int64, text string, userMsgID int) {
	topicID := b.states.Get(userID).CurrentTopicID
	_, err := b.store.Add(userID, topicID, text)
	if err != nil {
		b.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}

	// Удаляем сообщение пользователя
	if userMsgID != 0 {
		del := tgbotapi.NewDeleteMessage(chatID, userMsgID)
		b.api.Request(del)
	}

	// Обновляем список
	lastMsgID := b.states.Get(userID).LastListMsgID
	if lastMsgID != 0 {
		b.showListPage(chatID, lastMsgID, userID, 0)
	} else {
		b.showList(chatID, userID)
	}
}

func (b *Bot) doEdit(chatID int64, userID int64, noteID int64, text string, userMsgID int) {
	if err := b.store.Edit(userID, noteID, text); err != nil {
		b.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
	if userMsgID != 0 {
		del := tgbotapi.NewDeleteMessage(chatID, userMsgID)
		b.api.Request(del)
	}
	lastMsgID := b.states.Get(userID).LastListMsgID
	if lastMsgID != 0 {
		b.showListPage(chatID, lastMsgID, userID, 0)
	} else {
		b.showList(chatID, userID)
	}
}

func (b *Bot) doDelete(chatID int64, userID int64, noteID int64) {
	if err := b.store.Delete(userID, noteID); err != nil {
		b.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
	lastMsgID := b.states.Get(userID).LastListMsgID
	if lastMsgID != 0 {
		b.showListPage(chatID, lastMsgID, userID, 0)
	} else {
		b.showList(chatID, userID)
	}
}

func (b *Bot) doArchive(chatID int64, userID int64, noteID int64) {
	if err := b.store.Archive(userID, noteID); err != nil {
		b.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
	lastMsgID := b.states.Get(userID).LastListMsgID
	if lastMsgID != 0 {
		b.showListPage(chatID, lastMsgID, userID, 0)
	} else {
		b.showList(chatID, userID)
	}
}

func (b *Bot) doNewTopic(chatID int64, userID int64, name string) {
	if name == "" {
		b.send(chatID, "❌ Название топика не может быть пустым.")
		return
	}
	t, err := b.store.CreateTopic(userID, name)
	if err != nil {
		b.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
	b.send(chatID, fmt.Sprintf("📂 Топик «%s» создан (#%d).", t.Name, t.ID))
}

func (b *Bot) doSetTopic(chatID int64, userID int64, topicID int64) {
	// topicID == 0 — сброс (без топика)
	if topicID != 0 {
		_, err := b.store.GetTopic(userID, topicID)
		if err != nil {
			b.send(chatID, fmt.Sprintf("❌ %v", err))
			return
		}
		b.states.Get(userID).CurrentTopicID = topicID
		b.showList(chatID, userID)
	} else {
		b.states.Get(userID).CurrentTopicID = 0
		b.showList(chatID, userID)
	}
}

// seedDefaults создаёт дефолтные топики и задачи новому пользователю.
func (b *Bot) seedDefaults(chatID, userID int64) {
	topics, err := b.store.ListTopics(userID)
	if err != nil || len(topics) > 0 {
		return // уже есть данные
	}

	// Создаём топики
	personal, _ := b.store.CreateTopic(userID, "🏠 Личное")
	work, _ := b.store.CreateTopic(userID, "💼 Работа")

	// Задачи в «Личное»
	b.store.Add(userID, personal.ID, "Купить продукты: хлеб, молоко, яйца")
	b.store.Add(userID, personal.ID, "Записаться к стоматологу")
	b.store.Add(userID, personal.ID, "Позвонить родителям")

	// Задачи в «Работа»
	b.store.Add(userID, work.ID, "Подготовить отчёт за квартал")
	b.store.Add(userID, work.ID, "Созвон с командой в 15:00")

	// Ставим «Личное» текущим топиком
	b.states.Get(userID).CurrentTopicID = personal.ID
}

// ============================================================
// Callback implementations
// ============================================================

func (b *Bot) callbackSetTopic(chatID int64, msgID int, userID int64, topicID int64) {
	b.callbackAnswer(chatID, msgID, "✅")
	del := tgbotapi.NewDeleteMessage(chatID, msgID)
	b.api.Request(del)
	b.doSetTopic(chatID, userID, topicID)
}

func (b *Bot) callbackViewNote(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := b.store.Get(userID, noteID)
	if err != nil {
		b.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	text := fmt.Sprintf("📝 *#%d*\n%s", note.ID, note.Text)

	// Запоминаем, какую заметку смотрит пользователь
	b.states.Get(userID).LastViewedNoteID = note.ID

	// Кнопка редактирования подставляет текст в инпут
	query := fmt.Sprintf("\n\n%s", note.Text)
	editBtn := tgbotapi.InlineKeyboardButton{
		Text:                         "✏️ Изменить",
		SwitchInlineQueryCurrentChat: &query,
	}
	delBtn := tgbotapi.NewInlineKeyboardButtonData("🗑 Удалить", fmt.Sprintf("askdel:%d", note.ID))
	archBtn := tgbotapi.NewInlineKeyboardButtonData("📦 Архив", fmt.Sprintf("archnote:%d", note.ID))

	rows := [][]tgbotapi.InlineKeyboardButton{
		tgbotapi.NewInlineKeyboardRow(editBtn, delBtn, archBtn),
	}

	// Навигация ← Пред / След →
	topicID := b.states.Get(userID).CurrentTopicID
	notes, _ := b.store.List(userID, topicID)
	var prevID, nextID int64
	for i, n := range notes {
		if n.ID == noteID {
			if i+1 < len(notes) {
				prevID = notes[i+1].ID // в обратном порядке (DESC): следующая в списке = "пред" по навигации
			}
			if i-1 >= 0 {
				nextID = notes[i-1].ID
			}
			break
		}
	}

	var navRow []tgbotapi.InlineKeyboardButton
	if prevID != 0 {
		navRow = append(navRow, tgbotapi.NewInlineKeyboardButtonData("← Пред", fmt.Sprintf("view:%d", prevID)))
	}
	navRow = append(navRow, tgbotapi.NewInlineKeyboardButtonData("◀️ Назад", "backtolist"))
	if nextID != 0 {
		navRow = append(navRow, tgbotapi.NewInlineKeyboardButtonData("След →", fmt.Sprintf("view:%d", nextID)))
	}
	rows = append(rows, navRow)

	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, tgbotapi.NewInlineKeyboardMarkup(rows...))
	edit.ParseMode = tgbotapi.ModeMarkdown
	b.api.Send(edit)
}

func (b *Bot) callbackEditNote(chatID int64, userID int64, noteID int64) {
	note, err := b.store.Get(userID, noteID)
	if err != nil {
		b.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
	session := b.states.Get(userID)
	session.State = StateWaitingEditText
	session.EditNoteID = noteID
	b.sendMD(chatID, fmt.Sprintf(
		"✏️ *Редактирование #%d*\n\n`%s`\n\n_Введите новый текст ⬇️_",
		note.ID, note.Text,
	))
}

func (b *Bot) askDeleteNote(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := b.store.Get(userID, noteID)
	if err != nil {
		b.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	text := fmt.Sprintf("🗑 Удалить заметку *#%d*?\n\n_%s_", note.ID, formatPreview(note.Text, 100, 3))
	yesBtn := tgbotapi.NewInlineKeyboardButtonData("✅ Да", fmt.Sprintf("confdel:%d", note.ID))
	noBtn := tgbotapi.NewInlineKeyboardButtonData("❌ Нет", fmt.Sprintf("view:%d", note.ID))
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(yesBtn, noBtn),
	))
	edit.ParseMode = tgbotapi.ModeMarkdown
	b.api.Send(edit)
}

func (b *Bot) callbackDeleteNote(chatID int64, userID int64, noteID int64) {
	b.doDelete(chatID, userID, noteID)
}

func (b *Bot) callbackArchiveNote(chatID, userID, noteID int64) {
	b.doArchive(chatID, userID, noteID)
}

func (b *Bot) callbackBackToList(chatID int64, msgID int, userID int64) {
	b.showListPage(chatID, msgID, userID, 0)
}

func (b *Bot) showArchived(chatID int64, msgID int, userID int64) {
	notes, err := b.store.ListArchived(userID)
	if err != nil {
		if msgID != 0 {
			b.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		} else {
			b.send(chatID, fmt.Sprintf("❌ %v", err))
		}
		return
	}

	header := fmt.Sprintf("📦 Архив (%d):", len(notes))
	if len(notes) == 0 {
		text := header + "\n\n📭 Архив пуст."
		backBtn := tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("◀️ Назад", "backtolist"),
		)
		markup := tgbotapi.NewInlineKeyboardMarkup(backBtn)
		if msgID == 0 {
			msg := tgbotapi.NewMessage(chatID, text)
			msg.ReplyMarkup = markup
			b.api.Send(msg)
		} else {
			edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
			b.api.Send(edit)
		}
		return
	}

	var rows [][]tgbotapi.InlineKeyboardButton
	for _, n := range notes {
		label := formatPreview(n.Text, 50, 1)
		if label == "" {
			label = "..."
		}
		viewBtn := tgbotapi.NewInlineKeyboardButtonData(label, fmt.Sprintf("view:%d", n.ID))
		unarchBtn := tgbotapi.NewInlineKeyboardButtonData("↩️", fmt.Sprintf("unarch:%d", n.ID))
		rows = append(rows, tgbotapi.NewInlineKeyboardRow(viewBtn, unarchBtn))
	}
	rows = append(rows, tgbotapi.NewInlineKeyboardRow(
		tgbotapi.NewInlineKeyboardButtonData("◀️ Назад", "backtolist"),
	))
	markup := tgbotapi.NewInlineKeyboardMarkup(rows...)

	if msgID == 0 {
		msg2 := tgbotapi.NewMessage(chatID, header)
		msg2.ReplyMarkup = markup
		b.api.Send(msg2)
	} else {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, header, markup)
		b.api.Send(edit)
	}
}

func (b *Bot) doUnarchive(chatID int64, msgID int, userID int64, noteID int64) {
	if err := b.store.Unarchive(userID, noteID); err != nil {
		b.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	// Обновляем архив и основной список
	b.showArchived(chatID, msgID, userID)
	lastMsgID := b.states.Get(userID).LastListMsgID
	if lastMsgID != 0 && lastMsgID != msgID {
		b.showListPage(chatID, lastMsgID, userID, 0)
	}
}

func (b *Bot) callbackAnswer(chatID int64, msgID int, text string) {
	edit := tgbotapi.NewEditMessageText(chatID, msgID, text)
	b.api.Send(edit)
}

// handleCommandText парсит текст после обрезки @bot_username.
// Если текст без команд — редактирует последнюю просмотренную заметку.
func (b *Bot) handleCommandText(msg *tgbotapi.Message, userID int64, text string) {
	// Команда
	if strings.HasPrefix(text, "/") {
		oldText := msg.Text
		msg.Text = text
		b.handleCommand(msg)
		msg.Text = oldText
		return
	}

	// Просто текст — редактируем последнюю просмотренную заметку
	noteID := b.states.Get(userID).LastViewedNoteID
	if noteID != 0 {
		b.doEdit(msg.Chat.ID, userID, noteID, text, msg.MessageID)
		return
	}

	// Нет контекста — новая заметка
	b.doAdd(msg.Chat.ID, userID, text, msg.MessageID)
}

// ============================================================
// Helpers
// ============================================================

// formatPreview обрезает текст до maxLines строк, каждая не длиннее maxChars.
func formatPreview(text string, maxChars, maxLines int) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return text
	}

	var result []string
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if len([]rune(line)) > maxChars {
			runes := []rune(line)
			line = string(runes[:maxChars-3]) + "..."
		}
		result = append(result, line)
		if len(result) >= maxLines {
			break
		}
	}
	if len(result) == 0 {
		return text
	}
	return strings.Join(result, "\n")
}

// registerCommands регистрирует список команд бота в Telegram.
func (b *Bot) registerCommands() error {
	cmds := []tgbotapi.BotCommand{
		{Command: "start", Description: "Начать"},
		{Command: "list", Description: "Список"},
		{Command: "topics", Description: "Список топиков"},
		{Command: "archived", Description: "Архив заметок"},
		{Command: "backup", Description: "Скачать бэкап базы"},
	}
	setCmd := tgbotapi.NewSetMyCommands(cmds...)
	_, err := b.api.Request(setCmd)
	return err
}

func (b *Bot) topicHint(userID int64) string {
	session := b.states.Get(userID)
	if session.CurrentTopicID == 0 {
		return ""
	}
	t, err := b.store.GetTopic(userID, session.CurrentTopicID)
	if err != nil {
		return ""
	}
	return fmt.Sprintf(" (топик: %s)", t.Name)
}

func (b *Bot) newMsg(chatID int64, text string) tgbotapi.MessageConfig {
	msg := tgbotapi.NewMessage(chatID, text)
	msg.ReplyMarkup = b.replyKeyboard()
	return msg
}

func (b *Bot) send(chatID int64, text string) {
	b.api.Send(b.newMsg(chatID, text))
}

func (b *Bot) replyKeyboard() tgbotapi.ReplyKeyboardMarkup {
	return tgbotapi.NewReplyKeyboard(
		tgbotapi.NewKeyboardButtonRow(
			tgbotapi.NewKeyboardButton("📝 Список"),
			tgbotapi.NewKeyboardButton("📂 Топики"),
		),
	)
}

func (b *Bot) deleteUserMsg(msg *tgbotapi.Message) {
	if msg == nil {
		return
	}
	del := tgbotapi.NewDeleteMessage(msg.Chat.ID, msg.MessageID)
	b.api.Request(del)
}

func (b *Bot) sendMD(chatID int64, text string) {
	msg := tgbotapi.NewMessage(chatID, text)
	msg.ParseMode = tgbotapi.ModeMarkdown
	b.api.Send(msg)
}

// sendReply отправляет сообщение с Reply-клавиатурой, показывающей текущий топик.
func (b *Bot) sendReply(chatID int64, userID int64, text string) {
	msg := tgbotapi.NewMessage(chatID, text)
	// msg.ReplyMarkup = b.topicKeyboard(userID)
	b.api.Send(msg)
}

// sendReplyMD отправляет Markdown-сообщение с Reply-клавиатурой.
func (b *Bot) sendReplyMD(chatID int64, userID int64, text string) {
	msg := tgbotapi.NewMessage(chatID, text)
	msg.ParseMode = tgbotapi.ModeMarkdown
	// msg.ReplyMarkup = b.topicKeyboard(userID)
	b.api.Send(msg)
}

// topicKeyboard возвращает ReplyKeyboardMarkup с текущим топиком и быстрыми кнопками.
// func (b *Bot) topicKeyboard(userID int64) tgbotapi.ReplyKeyboardMarkup {
// 	session := b.states.Get(userID)

// 	topicLabel := "📂 Все"
// 	if session.CurrentTopicID != 0 {
// 		t, err := b.store.GetTopic(userID, session.CurrentTopicID)
// 		if err == nil {
// 			topicLabel = fmt.Sprintf("📂 %s", t.Name)
// 		}
// 	}

// 	return tgbotapi.NewReplyKeyboard(
// 		tgbotapi.NewKeyboardButtonRow(
// 			tgbotapi.NewKeyboardButton(topicLabel),
// 		),
// 		tgbotapi.NewKeyboardButtonRow(
// 			tgbotapi.NewKeyboardButton("📝 /list"),
// 			tgbotapi.NewKeyboardButton("➕ /add"),
// 		),
// 	)
// }
