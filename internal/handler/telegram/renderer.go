package telegram

import (
	"fmt"
	"strings"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"

	"todo-bot-tg/internal/model"
)

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

// replyKeyboard возвращает ReplyKeyboardMarkup с быстрыми кнопками.
func replyKeyboard() tgbotapi.ReplyKeyboardMarkup {
	return tgbotapi.NewReplyKeyboard(
		tgbotapi.NewKeyboardButtonRow(
			tgbotapi.NewKeyboardButton("📝 Список"),
			tgbotapi.NewKeyboardButton("📂 Топики"),
		),
	)
}

// buildTopicsMessage строит текст и разметку для списка топиков.
func buildTopicsMessage(topics []model.Topic, currentID int64, userID int64, counts map[int64]int) (string, tgbotapi.InlineKeyboardMarkup) {
	var rows [][]tgbotapi.InlineKeyboardButton

	allCount := 0
	for _, c := range counts {
		allCount += c
	}

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
		count := counts[t.ID]
		prefix := "  "
		if t.ID == currentID {
			prefix = "✅ "
		}
		label := fmt.Sprintf("%s%s (%d)", prefix, t.Name, count)
		rows = append(rows, tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData(label, fmt.Sprintf("settopic:%d", t.ID)),
		))
	}

	text := "📂 *Топики*"
	return text, tgbotapi.NewInlineKeyboardMarkup(rows...)
}

// buildListMessage строит текст и разметку для списка заметок.
func buildListMessage(notes []model.Note, header string, topicID int64, page, totalPages int) (string, tgbotapi.InlineKeyboardMarkup) {
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

// buildArchivedMessage строит текст и разметку для архива.
func buildArchivedMessage(notes []model.Note) (string, tgbotapi.InlineKeyboardMarkup) {
	header := fmt.Sprintf("📦 Архив (%d):", len(notes))

	if len(notes) == 0 {
		backBtn := tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("◀️ Назад", "backtolist"),
		)
		return header + "\n\n📭 Архив пуст.", tgbotapi.NewInlineKeyboardMarkup(backBtn)
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

	return header, tgbotapi.NewInlineKeyboardMarkup(rows...)
}

// buildViewNoteMessage строит текст и разметку для просмотра заметки.
func buildViewNoteMessage(note model.Note) (string, tgbotapi.InlineKeyboardMarkup) {
	text := fmt.Sprintf("📝 *#%d*\n%s", note.ID, note.Text)
	query := fmt.Sprintf("\n\n%s", note.Text)

	editBtn := tgbotapi.InlineKeyboardButton{
		Text:                         "✏️ Изменить",
		SwitchInlineQueryCurrentChat: &query,
	}
	delBtn := tgbotapi.NewInlineKeyboardButtonData("🗑 Удалить", fmt.Sprintf("askdel:%d", note.ID))
	archBtn := tgbotapi.NewInlineKeyboardButtonData("📦 Архив", fmt.Sprintf("archnote:%d", note.ID))
	backBtn := tgbotapi.NewInlineKeyboardButtonData("◀️ Назад", "backtolist")

	return text, tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(editBtn, delBtn, archBtn),
		tgbotapi.NewInlineKeyboardRow(backBtn),
	)
}

// buildDeleteConfirmMessage строит диалог подтверждения удаления.
func buildDeleteConfirmMessage(note model.Note) (string, tgbotapi.InlineKeyboardMarkup) {
	text := fmt.Sprintf("🗑 Удалить заметку *#%d*?\n\n_%s_", note.ID, formatPreview(note.Text, 100, 3))
	yesBtn := tgbotapi.NewInlineKeyboardButtonData("✅ Да", fmt.Sprintf("confdel:%d", note.ID))
	noBtn := tgbotapi.NewInlineKeyboardButtonData("❌ Нет", fmt.Sprintf("view:%d", note.ID))
	return text, tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(yesBtn, noBtn),
	)
}

// buildHelpMessage строит сообщение справки.
func buildHelpMessage() (string, tgbotapi.InlineKeyboardMarkup) {
	listBtn := tgbotapi.NewInlineKeyboardButtonData("📝 Список", "backtolist")
	topicsBtn := tgbotapi.NewInlineKeyboardButtonData("📂 Топики", "topics:0")

	text := "📋 *Справка*\n\nВыберите действие или используйте команды:"
	return text, tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(listBtn),
		tgbotapi.NewInlineKeyboardRow(topicsBtn),
	)
}

// now возвращает текущее время (для подстановки в тестах).
var now = time.Now
