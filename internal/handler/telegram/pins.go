package telegram

import (
	"fmt"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

// ============================================================
// Pin callbacks
// ============================================================

// callbackPinMenu — меню закрепления: постоянно или на время.
func (h *Handler) callbackPinMenu(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	text, markup := buildPinMenu(note, h.states.Get(userID).TimezoneOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	h.api.Send(edit)
}

// callbackPinForever — закрепить заметку постоянно.
func (h *Handler) callbackPinForever(chatID int64, msgID int, userID int64, noteID int64) {
	h.mutateNote(chatID, msgID, userID, noteID, func() error {
		return h.noteService.PinNote(userID, noteID)
	})
}

// callbackPinTime — выбор длительности закрепления.
func (h *Handler) callbackPinTime(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	text, markup := buildPinTimeMenu(note, h.states.Get(userID).TimezoneOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	h.api.Send(edit)
}

// callbackPinForHours — закрепить заметку на заданное число часов.
func (h *Handler) callbackPinForHours(chatID int64, msgID int, userID int64, noteID int64, hours int) {
	h.mutateNote(chatID, msgID, userID, noteID, func() error {
		return h.noteService.PinNoteUntil(userID, noteID, time.Now().UTC().Add(time.Duration(hours)*time.Hour))
	})
}

// callbackPinCalendar — календарь выбора даты окончания закрепления.
func (h *Handler) callbackPinCalendar(chatID int64, msgID int, userID int64, params string) {
	noteID, year, month := parseReminder3(params)
	if noteID == 0 {
		return
	}
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildCalendar(noteID, year, time.Month(month), tzOffset, "pin")
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	h.api.Send(edit)
}

func (h *Handler) callbackPinDay(chatID int64, msgID int, userID int64, params string) {
	noteID, year, month, day := parseReminder4(params)
	if noteID == 0 {
		return
	}
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildHourPicker(noteID, year, time.Month(month), day, tzOffset, "pin")
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	h.api.Send(edit)
}

func (h *Handler) callbackPinHour(chatID int64, msgID int, userID int64, params string) {
	noteID, year, month, day, hour := parseReminder5(params)
	if noteID == 0 {
		return
	}
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildMinuteRangePicker(noteID, year, time.Month(month), day, hour, tzOffset, "pin")
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	h.api.Send(edit)
}

func (h *Handler) callbackPinMinuteRange(chatID int64, msgID int, userID int64, params string) {
	noteID, year, month, day, hour, startMin := parseReminder6(params)
	if noteID == 0 {
		return
	}
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildMinuteExactPicker(noteID, year, time.Month(month), day, hour, startMin, tzOffset, "pin")
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	h.api.Send(edit)
}

// callbackPinMinute — финальный шаг: закрепить заметку до выбранного времени.
func (h *Handler) callbackPinMinute(chatID int64, msgID int, userID int64, params string) {
	noteID, year, month, day, hour, minute := parseReminder6(params)
	if noteID == 0 {
		return
	}

	tzOffset := h.states.Get(userID).TimezoneOffset
	loc := userLocation(tzOffset)

	// Конвертируем пользовательское время в UTC для хранения
	at := time.Date(year, time.Month(month), day, hour, minute, 0, 0, loc).UTC()
	if !at.After(time.Now().UTC()) {
		h.callbackAnswer(chatID, msgID, "❌ Время уже прошло, выбери будущее время")
		return
	}

	h.mutateNote(chatID, msgID, userID, noteID, func() error {
		return h.noteService.PinNoteUntil(userID, noteID, at)
	})
}
