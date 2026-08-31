package telegram

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"

	"todo-bot-tg/internal/model"
)

// ============================================================
// Reminder callbacks
// ============================================================

func (h *Handler) callbackReminderCalendar(chatID int64, msgID int, userID int64, params string) {
	noteID, year, month := parseReminder3(params)
	if noteID == 0 {
		return
	}
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildCalendar(noteID, year, time.Month(month), tzOffset, "rem")
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	h.api.Send(edit)
}

func (h *Handler) callbackReminderDay(chatID int64, msgID int, userID int64, params string) {
	noteID, year, month, day := parseReminder4(params)
	if noteID == 0 {
		return
	}
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildHourPicker(noteID, year, time.Month(month), day, tzOffset, "rem")
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	h.api.Send(edit)
}

func (h *Handler) callbackReminderHour(chatID int64, msgID int, userID int64, params string) {
	noteID, year, month, day, hour := parseReminder5(params)
	if noteID == 0 {
		return
	}
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildMinuteRangePicker(noteID, year, time.Month(month), day, hour, tzOffset, "rem")
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	h.api.Send(edit)
}

func (h *Handler) callbackReminderMinuteRange(chatID int64, msgID int, userID int64, params string) {
	noteID, year, month, day, hour, startMin := parseReminder6(params)
	if noteID == 0 {
		return
	}
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildMinuteExactPicker(noteID, year, time.Month(month), day, hour, startMin, tzOffset, "rem")
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
	remRepeat, err := model.NewReminderRepeat(repeat)
	if err != nil {
		h.callbackAnswer(chatID, msgID, "❌ Некорректный тип повторения")
		return
	}

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
	edit.ParseMode = noteParseMode(note)
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
	edit.ParseMode = noteParseMode(note)
	h.api.Send(edit)

	lastMsgID := h.states.Get(userID).LastListMsgID
	if lastMsgID != 0 && lastMsgID != msgID {
		h.showListPage(chatID, lastMsgID, userID, 0)
	}
}

// ============================================================
// Reminder notification actions
// ============================================================

// snoozeLabel форматирует интервал отложки: "15 мин", "1 час".
func snoozeLabel(minutes int) string {
	if minutes%60 == 0 {
		return fmt.Sprintf("%d час", minutes/60)
	}
	return fmt.Sprintf("%d мин", minutes)
}

// callbackSnoozeReminder откладывает напоминание на указанное число минут.
// Сообщение-напоминание превращается в короткое подтверждение.
func (h *Handler) callbackSnoozeReminder(chatID int64, msgID int, userID int64, noteID int64, minutes int) {
	if err := h.noteService.SnoozeReminder(userID, noteID, minutes); err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	edit := tgbotapi.NewEditMessageText(chatID, msgID, fmt.Sprintf("⏰ Напомню через %s", snoozeLabel(minutes)))
	h.api.Send(edit)
}

// callbackDoneReminder выполняет задачу из сообщения-напоминания
// (таймер сбрасывается в MarkDone) и удаляет сообщение.
func (h *Handler) callbackDoneReminder(chatID int64, msgID int, userID int64, noteID int64) {
	if err := h.noteService.MarkDone(userID, noteID); err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	del := tgbotapi.NewDeleteMessage(chatID, msgID)
	h.api.Request(del)

	// Обновляем список в фоне — задача перешла в выполненные
	lastMsgID := h.states.Get(userID).LastListMsgID
	if lastMsgID != 0 && lastMsgID != msgID {
		h.showListPage(chatID, lastMsgID, userID, 0)
	}
}

// ============================================================
// Reminder params parsing helpers
// ============================================================

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
