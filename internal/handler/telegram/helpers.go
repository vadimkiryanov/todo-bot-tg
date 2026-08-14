package telegram

import (
	"fmt"
	"strings"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

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
		{Command: "timers", Description: "Список таймеров"},
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

// confirmAutoDelete — время жизни сообщения-подтверждения
// («✅ …», «❌ …») перед автоудалением для чистоты чата.
const confirmAutoDelete = 5 * time.Second

// sendTimed отправляет сообщение и удаляет его через confirmAutoDelete.
func (h *Handler) sendTimed(chatID int64, text string) {
	sent, err := h.api.Send(h.newMsg(chatID, 0, text))
	if err != nil {
		return
	}
	time.AfterFunc(confirmAutoDelete, func() {
		del := tgbotapi.NewDeleteMessage(chatID, sent.MessageID)
		h.api.Request(del)
	})
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

// parseURL разбирает строку подключения вида postgres://user:pass@host:port/dbname?...
func parseURL(rawURL string) (dbURLInfo, error) {
	s := rawURL
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
