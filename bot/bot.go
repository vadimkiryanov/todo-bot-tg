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
	case "add":
		b.cmdAdd(msg, userID, args)
	case "list":
		b.cmdList(msg, userID)
	case "edit":
		b.cmdEdit(msg, userID, args)
	case "delete":
		b.cmdDelete(msg, userID, args)
	case "archive":
		b.cmdArchive(msg, userID, args)
	case "backup":
		b.cmdBackup(msg)
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
		case text == "📝 /list":
			b.cmdList(msg, userID)
		case text == "➕ /add":
			b.states.SetState(userID, StateWaitingAddText)
			b.send(msg.Chat.ID, "📝 Введите текст заметки:")
		case strings.HasPrefix(text, "📂 "):
			b.cmdTopics(msg, userID)
		default:
			// Idle — любое сообщение = добавление заметки
			b.doAdd(msg.Chat.ID, userID, text)
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
		return
	}
	action, idStr := parts[0], parts[1]
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return
	}

	switch action {
	case "settopic":
		b.callbackSetTopic(chatID, msgID, userID, id)
	case "view":
		b.callbackViewNote(chatID, msgID, userID, id)
	case "editnote":
		// Обрабатывается через SwitchInlineQuery, оставлено для совместимости
	case "delnote":
		b.callbackDeleteNote(chatID, userID, id)
	case "archnote":
		b.callbackArchiveNote(chatID, userID, id)
	}
}

// ============================================================
// Command implementations
// ============================================================

func (b *Bot) cmdStart(msg *tgbotapi.Message) {
	userID := msg.From.ID

	// Seed default topics/notes for new users
	// b.seedDefaults(msg.Chat.ID, userID)

	// Show current topic
	session := b.states.Get(userID)
	topicLine := ""
	if session.CurrentTopicID != 0 {
		t, err := b.store.GetTopic(userID, session.CurrentTopicID)
		if err == nil {
			topicLine = fmt.Sprintf("\n📂 Текущий топик: *«%s»*\n", t.Name)
		}
	} else {
		topicLine = "\n📂 Топик не выбран.\n"
	}

	text := "👋 Привет! Я — личный таск-менеджер." + topicLine + "\n" +
		"📂 *Топики:*\n" +
		"/topics — список топиков\n" +
		"/newtopic <название> — создать топик\n" +
		"/settopic <id> — перейти в топик\n" +
		"/deltopic <id> — удалить топик\n\n" +
		"📝 *Заметки:*\n" +
		"/add <текст> — добавить заметку\n" +
		"/list — показать заметки\n" +
		"/edit <id> <текст> — изменить\n" +
		"/delete <id> — удалить\n" +
		"/archive <id> — архивировать\n\n" +
		"💡 Команды без аргументов работают интерактивно."
	b.sendReplyMD(msg.Chat.ID, userID, text)
}

func (b *Bot) cmdHelp(msg *tgbotapi.Message) {
	userID := msg.From.ID
	text := "📋 *Справка*\n\n" +
		"Все команды можно вводить как с аргументами, так и без — " +
		"бот сам спросит, что нужно.\n\n" +
		"*/topics* — список топиков\n" +
		"*/newtopic* _<название>_ — создать топик\n" +
		"*/settopic* _<id>_ — перейти в топик\n" +
		"*/deltopic* _<id>_ — удалить топик\n" +
		"*/add* _<текст>_ — добавить заметку\n" +
		"*/list* — список заметок\n" +
		"*/edit* _<id> <текст>_ — изменить\n" +
		"*/delete* _<id>_ — удалить\n" +
		"*/archive* _<id>_ — архивировать\n\n" +
		"В /list нажмите на заметку — откроются действия ✏️🗑📦."
	b.sendReplyMD(msg.Chat.ID, userID, text)
}

// --- Topics ---

func (b *Bot) cmdTopics(msg *tgbotapi.Message, userID int64) {
	topics, err := b.store.ListTopics(userID)
	if err != nil {
		b.send(msg.Chat.ID, fmt.Sprintf("❌ %v", err))
		return
	}

	session := b.states.Get(userID)
	currentID := session.CurrentTopicID

	if len(topics) == 0 {
		b.send(msg.Chat.ID, "📭 Нет топиков. Создайте первый: /newtopic <название>")
		return
	}

	var rows [][]tgbotapi.InlineKeyboardButton
	for _, t := range topics {
		count, _ := b.store.CountNotes(userID, t.ID)

		prefix := "  "
		if t.ID == currentID {
			prefix = "✅ "
		}
		btn := tgbotapi.NewInlineKeyboardButtonData(
			fmt.Sprintf("%s%s (%d)", prefix, t.Name, count),
			fmt.Sprintf("settopic:%d", t.ID),
		)
		rows = append(rows, tgbotapi.NewInlineKeyboardRow(btn))
	}

	msg2 := tgbotapi.NewMessage(msg.Chat.ID, "📂 *Топики:*\n✅ — текущий топик. Нажмите, чтобы переключиться.")
	msg2.ParseMode = tgbotapi.ModeMarkdown
	msg2.ReplyMarkup = tgbotapi.NewInlineKeyboardMarkup(rows...)
	b.api.Send(msg2)
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
		topicHint := b.topicHint(userID)
		b.send(msg.Chat.ID, fmt.Sprintf("📝 Введите текст заметки.%s", topicHint))
		return
	}
	b.doAdd(msg.Chat.ID, userID, text)
}

func (b *Bot) cmdList(msg *tgbotapi.Message, userID int64) {
	b.showList(msg.Chat.ID, userID)
}

// showList отправляет список заметок в чат.
func (b *Bot) showList(chatID int64, userID int64) {
	session := b.states.Get(userID)
	notes, err := b.store.List(userID, session.CurrentTopicID)
	if err != nil {
		b.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}

	header := fmt.Sprintf("📝 Все заметки (%d):", len(notes))
	if session.CurrentTopicID != 0 {
		t, err := b.store.GetTopic(userID, session.CurrentTopicID)
		if err == nil {
			header = fmt.Sprintf("📝 Заметки в «%s» (%d):", t.Name, len(notes))
		}
	}
	if len(notes) == 0 {
		b.send(chatID, header+"\n\n📭 Пусто.")
		return
	}

	text, markup := b.buildListMessage(notes, header)

	msg2 := tgbotapi.NewMessage(chatID, text)
	msg2.ReplyMarkup = markup
	b.api.Send(msg2)
}

// buildListMessage строит текст и разметку для списка заметок.
func (b *Bot) buildListMessage(notes []store.Note, header string) (string, tgbotapi.InlineKeyboardMarkup) {
	var lines []string
	var btnRows [][]tgbotapi.InlineKeyboardButton
	maxPerRow := 5

	for i, n := range notes {
		preview := formatPreview(n.Text, 45, 3)
		num := i + 1

		previewLines := strings.Split(preview, "\n")
		lines = append(lines, fmt.Sprintf("%d. %s", num, previewLines[0]))
		for _, pl := range previewLines[1:] {
			lines = append(lines, fmt.Sprintf("   %s", pl))
		}

		btn := tgbotapi.NewInlineKeyboardButtonData(
			fmt.Sprintf("%d", num),
			fmt.Sprintf("view:%d", n.ID),
		)
		if len(btnRows) == 0 || len(btnRows[len(btnRows)-1]) >= maxPerRow {
			btnRows = append(btnRows, []tgbotapi.InlineKeyboardButton{})
		}
		lastRow := len(btnRows) - 1
		btnRows[lastRow] = append(btnRows[lastRow], btn)
	}

	return header + "\n\n" + strings.Join(lines, "\n"), tgbotapi.NewInlineKeyboardMarkup(btnRows...)
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
	b.doEdit(msg.Chat.ID, userID, id, parts[1])
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
	b.doAdd(msg.Chat.ID, userID, text)
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
	b.doEdit(msg.Chat.ID, userID, id, parts[1])
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
	b.doEdit(msg.Chat.ID, userID, noteID, text)
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

func (b *Bot) doAdd(chatID int64, userID int64, text string) {
	topicID := b.states.Get(userID).CurrentTopicID
	note, err := b.store.Add(userID, topicID, text)
	if err != nil {
		b.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
	topicHint := b.topicHint(userID)
	b.send(chatID, fmt.Sprintf("✅ Заметка #%d добавлена.%s\n%s", note.ID, topicHint, note.Text))
}

func (b *Bot) doEdit(chatID int64, userID int64, noteID int64, text string) {
	if err := b.store.Edit(userID, noteID, text); err != nil {
		b.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
	b.send(chatID, fmt.Sprintf("✅ Заметка #%d обновлена.", noteID))
	b.showList(chatID, userID)
}

func (b *Bot) doDelete(chatID int64, userID int64, noteID int64) {
	if err := b.store.Delete(userID, noteID); err != nil {
		b.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
	b.send(chatID, fmt.Sprintf("🗑 Заметка #%d удалена.", noteID))
}

func (b *Bot) doArchive(chatID int64, userID int64, noteID int64) {
	if err := b.store.Archive(userID, noteID); err != nil {
		b.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
	b.send(chatID, fmt.Sprintf("📦 Заметка #%d заархивирована.", noteID))
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
	b.sendReply(chatID, userID, fmt.Sprintf("📂 Топик «%s» создан (#%d).", t.Name, t.ID))
}

func (b *Bot) doSetTopic(chatID int64, userID int64, topicID int64) {
	// topicID == 0 — сброс (без топика)
	if topicID != 0 {
		t, err := b.store.GetTopic(userID, topicID)
		if err != nil {
			b.send(chatID, fmt.Sprintf("❌ %v", err))
			return
		}
		b.states.Get(userID).CurrentTopicID = topicID
		b.sendReply(chatID, userID, fmt.Sprintf("📂 Перешли в топик «%s» (#%d).", t.Name, t.ID))
	} else {
		b.states.Get(userID).CurrentTopicID = 0
		b.sendReply(chatID, userID, "📂 Топик сброшен. Заметки будут создаваться без топика.")
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
	delBtn := tgbotapi.NewInlineKeyboardButtonData("🗑 Удалить", fmt.Sprintf("delnote:%d", note.ID))
	archBtn := tgbotapi.NewInlineKeyboardButtonData("📦 Архив", fmt.Sprintf("archnote:%d", note.ID))
	backBtn := tgbotapi.NewInlineKeyboardButtonData("◀️ Назад", "backtolist")

	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(editBtn),
		tgbotapi.NewInlineKeyboardRow(delBtn, archBtn),
		tgbotapi.NewInlineKeyboardRow(backBtn),
	))
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

func (b *Bot) callbackDeleteNote(chatID int64, userID int64, noteID int64) {
	b.doDelete(chatID, userID, noteID)
}

func (b *Bot) callbackArchiveNote(chatID, userID, noteID int64) {
	b.doArchive(chatID, userID, noteID)
}

func (b *Bot) callbackBackToList(chatID int64, msgID int, userID int64) {
	session := b.states.Get(userID)
	notes, err := b.store.List(userID, session.CurrentTopicID)
	if err != nil {
		b.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}

	header := fmt.Sprintf("📝 Все заметки (%d):", len(notes))
	if session.CurrentTopicID != 0 {
		t, err := b.store.GetTopic(userID, session.CurrentTopicID)
		if err == nil {
			header = fmt.Sprintf("📝 Заметки в «%s» (%d):", t.Name, len(notes))
		}
	}
	if len(notes) == 0 {
		edit := tgbotapi.NewEditMessageText(chatID, msgID, header+"\n\n📭 Пусто.")
		b.api.Send(edit)
		return
	}

	text, markup := b.buildListMessage(notes, header)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	b.api.Send(edit)
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
		b.doEdit(msg.Chat.ID, userID, noteID, text)
		return
	}

	// Нет контекста — новая заметка
	b.doAdd(msg.Chat.ID, userID, text)
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

func (b *Bot) send(chatID int64, text string) {
	msg := tgbotapi.NewMessage(chatID, text)
	msg.ReplyMarkup = tgbotapi.NewRemoveKeyboard(true)
	b.api.Send(msg)
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
