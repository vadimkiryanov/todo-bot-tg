package telegram

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

// ============================================================
// Command implementations
// ============================================================

func (h *Handler) cmdStart(msg *tgbotapi.Message) {
	h.deleteUserMsg(msg)

	userID := msg.From.ID
	h.clearAttachmentView(msg.Chat.ID, userID)
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
	h.clearAttachmentView(msg.Chat.ID, userID)
	h.showTopics(msg.Chat.ID, h.states.Get(userID).LastListMsgID, userID)
}

func (h *Handler) cmdTopicsFromList(chatID int64, msgID int, userID int64) {
	h.showTopics(chatID, msgID, userID)
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
	h.clearAttachmentView(msg.Chat.ID, userID)
	h.states.Get(userID).DoneFolderActive = false
	h.showListPage(msg.Chat.ID, h.states.Get(userID).LastListMsgID, userID, 0)
}

// cmdTimers показывает список всех заметок пользователя с установленным таймером.
func (h *Handler) cmdTimers(msg *tgbotapi.Message, userID int64) {
	h.deleteUserMsg(msg)
	h.clearAttachmentView(msg.Chat.ID, userID)
	chatID := msg.Chat.ID
	msgID := h.states.Get(userID).LastListMsgID

	notes, err := h.noteService.ListTimers(userID)
	if err != nil {
		if msgID != 0 {
			h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		} else {
			h.send(chatID, fmt.Sprintf("❌ %v", err))
		}
		return
	}

	text, markup := buildTimersMessage(notes, h.states.Get(userID).TimezoneOffset)

	if msgID != 0 {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		if _, err := h.api.Send(edit); err == nil || isNotModified(err) {
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
	h.clearAttachmentView(chatID, userID)
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
	session.CurrentFolderID = nil                  // сбрасываем папку при смене топика
	session.ExpandedFolders = make(map[int64]bool) // сброс авто-схлопывания при смене топика
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

// --- Settings ---

func (h *Handler) cmdSettings(msg *tgbotapi.Message, userID int64) {
	h.deleteUserMsg(msg)
	h.clearAttachmentView(msg.Chat.ID, userID)
	h.showSettings(msg.Chat.ID, h.states.Get(userID).LastListMsgID, userID)
}

func (h *Handler) showSettings(chatID int64, msgID int, userID int64) {
	session := h.states.Get(userID)
	text, markup := buildSettingsMessage(session.ShowCounts, session.BreadcrumbInline, session.BreadcrumbBottom, session.ShowKeyboard, session.TimezoneOffset, session.FoldersCollapsed)

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
	case "breadcrumbbottom":
		session.BreadcrumbBottom = !session.BreadcrumbBottom
	case "keyboard":
		session.ShowKeyboard = !session.ShowKeyboard
	case "folderscollapse":
		session.FoldersCollapsed = !session.FoldersCollapsed
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
