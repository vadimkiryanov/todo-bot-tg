package telegram

import (
	"fmt"
	"strings"
	"time"
	"unicode"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"

	"todo-bot-tg/internal/model"
)

// strikethrough добавляет Unicode-зачёркивание (U+0336) к каждому символу текста.
func strikethrough(text string) string {
	var b strings.Builder
	for _, r := range text {
		b.WriteRune(r)
		b.WriteRune('\u0336')
	}
	return b.String()
}

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

// formatCounts форматирует счётчики заметок и папок, скрывая нулевые.
func formatCounts(noteCount, folderCount int) string {
	var parts []string
	if noteCount > 0 {
		parts = append(parts, fmt.Sprintf("%d📝", noteCount))
	}
	if folderCount > 0 {
		parts = append(parts, fmt.Sprintf("%d📁", folderCount))
	}
	if len(parts) == 0 {
		return ""
	}
	return fmt.Sprintf(" (%s)", strings.Join(parts, " "))
}

// buildTopicsMessage строит текст и разметку для списка топиков.
func buildTopicsMessage(topics []model.Topic, currentID int64, userID int64, counts map[int64]int, folderCounts map[int64]int, showCounts bool) (string, tgbotapi.InlineKeyboardMarkup) {
	var rows [][]tgbotapi.InlineKeyboardButton

	allCount := 0
	allFolders := 0
	for _, c := range counts {
		allCount += c
	}
	for _, fc := range folderCounts {
		allFolders += fc
	}

	allPrefix := "  "
	if currentID == 0 {
		allPrefix = "✅ "
	}
	allCountStr := ""
	if showCounts {
		allCountStr = formatCounts(allCount, allFolders)
	}
	rows = append(rows, tgbotapi.NewInlineKeyboardRow(
		tgbotapi.NewInlineKeyboardButtonData(
			fmt.Sprintf("%s📂 Все%s", allPrefix, allCountStr),
			"settopic:0",
		),
	))

	for _, t := range topics {
		count := counts[t.ID]
		fc := folderCounts[t.ID]
		prefix := "  "
		if t.ID == currentID {
			prefix = "✅ "
		}
		countStr := ""
		if showCounts {
			countStr = formatCounts(count, fc)
		}
		label := fmt.Sprintf("%s%s%s", prefix, t.Name, countStr)
		rows = append(rows, tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData(label, fmt.Sprintf("settopic:%d", t.ID)),
		))
	}

	text := "📂 *Топики*"
	return text, tgbotapi.NewInlineKeyboardMarkup(rows...)
}

// buildListMessage строит текст и разметку для списка заметок и папок.
// pageItems — элементы текущей страницы (папки и заметки).
// folderChain — цепочка папок для breadcrumb (nil если не в папке).
func buildListMessage(pageItems []listItem, topicID int64, topicName string, currentFolderID *int64, folderChain []model.Folder, page, totalPages int, showCounts bool, breadcrumbInline bool) (string, tgbotapi.InlineKeyboardMarkup) {
	btnRows := make([][]tgbotapi.InlineKeyboardButton, 0)

	// Текст сообщения — breadcrumb
	var text string
	if topicID != 0 {
		if breadcrumbInline {
			// Inline-кнопочный breadcrumb
			var crumbRow []tgbotapi.InlineKeyboardButton
			crumbRow = append(crumbRow, tgbotapi.NewInlineKeyboardButtonData("📔 ТОПИКИ", "crumb:0"))
			if topicName != "" {
				crumbRow = append(crumbRow, tgbotapi.NewInlineKeyboardButtonData(
					fmt.Sprintf("🏠 %s", topicName),
					"crumb:-1",
				))
			}
			for _, f := range folderChain {
				crumbRow = append(crumbRow, tgbotapi.NewInlineKeyboardButtonData(
					fmt.Sprintf("📁 %s", f.Name),
					fmt.Sprintf("crumb:%d", f.ID),
				))
			}
			btnRows = append(btnRows, crumbRow)
			text = fmt.Sprintf("                                                     [%s]", topicName)
		} else {
			text = "🏠 /TOPICS"
			if topicName != "" {
				text += fmt.Sprintf(" › /%s%s", strings.ToUpper(sanitize(topicName)), emojiDecoration(topicName))
			}
			for _, f := range folderChain {
				text += fmt.Sprintf(" › /%s%s", strings.ToUpper(sanitize(f.Name)), emojiDecoration(f.Name))
			}
		}
	} else {
		text = "📝 Все заметки"
		btnRows = append(btnRows, tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("🔝 Топики", "topics:0"),
		))
	}

	// Элементы списка — каждый своей кнопкой
	for _, item := range pageItems {
		if item.isFolder {
			folderLabel := fmt.Sprintf("📁 %s", item.folder.Name)
			if showCounts {
				folderLabel += formatCounts(item.noteCount, item.folderCount)
			}
			btnRows = append(btnRows, tgbotapi.NewInlineKeyboardRow(
				tgbotapi.NewInlineKeyboardButtonData(
					folderLabel,
					fmt.Sprintf("openfolder:%d", item.folder.ID),
				),
			))
		} else {
			prefix := ""
			if item.note.Done {
				prefix = "✅ "
			} else if emoji := item.note.PriorityEmoji(); emoji != "" {
				prefix = emoji + " "
			}
			preview := formatPreview(item.note.Text, 50, 1)
			if preview == "" {
				preview = "..."
			}
			if item.note.Done {
				preview = strikethrough(preview)
			}
			btnRows = append(btnRows, tgbotapi.NewInlineKeyboardRow(
				tgbotapi.NewInlineKeyboardButtonData(
					fmt.Sprintf("%s%s", prefix, preview),
					fmt.Sprintf("view:%d", item.note.ID),
				),
			))
		}
	}

	// Если список пуст — кнопка «добавить»
	if len(btnRows) == 0 {
		btnRows = append(btnRows, tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("📝 Добавить заметку", "addnote"),
		))
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

	return text, tgbotapi.NewInlineKeyboardMarkup(btnRows...)
}

// listItem — элемент списка (папка или заметка).
type listItem struct {
	isFolder    bool
	folder      model.Folder
	note        model.Note
	noteCount   int // количество заметок в папке (только для папок)
	folderCount int // количество подпапок (только для папок)
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
	prefix := ""
	if note.Done {
		prefix = "✅ "
	} else if emoji := note.PriorityEmoji(); emoji != "" {
		prefix = emoji + " "
	}

	doneLine := ""
	if note.Done {
		doneLine = "\n✅ Выполнена"
	}

	displayText := tgbotapi.EscapeText(tgbotapi.ModeMarkdown, note.Text)
	if note.Done {
		displayText = strikethrough(displayText)
	}

	reminderLine := ""
	if note.ReminderAt != nil {
		reminderLine = fmt.Sprintf("\n⏰ %s", note.ReminderAt.Format("02.01.2006 15:04"))
	}

	text := fmt.Sprintf("%s*#%d*\n%s%s%s", prefix, note.ID, displayText, doneLine, reminderLine)
	query := fmt.Sprintf("\n\n%s", note.Text)

	editBtn := tgbotapi.InlineKeyboardButton{
		Text:                         "✏️",
		SwitchInlineQueryCurrentChat: &query,
	}
	delBtn := tgbotapi.NewInlineKeyboardButtonData("🗑", fmt.Sprintf("askdel:%d", note.ID))
	archBtn := tgbotapi.NewInlineKeyboardButtonData("📦", fmt.Sprintf("archnote:%d", note.ID))
	prioBtn := tgbotapi.NewInlineKeyboardButtonData(
		prioBtnLabel(note.Priority, note.PriorityEmoji()),
		fmt.Sprintf("chprio:%d", note.ID),
	)

	// Done/Undone toggle
	doneLabel := "✅"
	doneCallback := fmt.Sprintf("done:%d", note.ID)
	if note.Done {
		doneLabel = "🔄"
		doneCallback = fmt.Sprintf("undone:%d", note.ID)
	}
	doneBtn := tgbotapi.NewInlineKeyboardButtonData(doneLabel, doneCallback)

	// ⏰ — единая точка входа: если таймер есть → меню, иначе сразу календарь
	remCallback := fmt.Sprintf("remcal:%d:%d:%d", note.ID, now().Year(), now().Month())
	if note.ReminderAt != nil {
		remCallback = fmt.Sprintf("remmenu:%d", note.ID)
	}
	remBtn := tgbotapi.NewInlineKeyboardButtonData("⏰", remCallback)

	moveBtn := tgbotapi.NewInlineKeyboardButtonData("🗂️♻️", fmt.Sprintf("move:%d", note.ID))

	backBtn := tgbotapi.NewInlineKeyboardButtonData("◀️ Назад", "backtolist")

	return text, tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(editBtn, delBtn, archBtn, prioBtn, doneBtn, remBtn, moveBtn),
		tgbotapi.NewInlineKeyboardRow(backBtn),
	)
}

// buildReminderMenu строит меню управления напоминанием.
func buildReminderMenu(note model.Note) (string, tgbotapi.InlineKeyboardMarkup) {
	reminderLine := ""
	if note.ReminderAt != nil {
		reminderLine = fmt.Sprintf("\n⏰ %s", note.ReminderAt.Format("02.01.2006 15:04"))
	}

	text := fmt.Sprintf("⏰ Напоминание (местное)%s", reminderLine)

	editBtn := tgbotapi.NewInlineKeyboardButtonData(
		"✏️ Изменить",
		fmt.Sprintf("remcal:%d:%d:%d", note.ID, now().Year(), now().Month()),
	)
	delBtn := tgbotapi.NewInlineKeyboardButtonData("🗑 Удалить", fmt.Sprintf("remclear:%d", note.ID))
	backBtn := tgbotapi.NewInlineKeyboardButtonData("◀️ Назад", fmt.Sprintf("view:%d", note.ID))

	return text, tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(editBtn, delBtn),
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

	text := "Команды:\n\n" +
		"/add [текст] — добавить заметку\n" +
		"/edit <id> <текст> — изменить заметку\n" +
		"/delete <id> — удалить заметку\n" +
		"/archive <id> — архивировать заметку\n" +
		"/archived — архив заметок\n" +
		"/list — список заметок\n" +
		"/topics — список топиков\n" +
		"/newtopic [название] — создать топик\n" +
		"/settopic <id> — установить текущий топик\n" +
		"/deltopic <id> — удалить топик\n" +
		"/newfolder [название] — создать папку\n" +
		"/backup — скачать бэкап\n" +
		"/settings — настройки\n" +
		"/help — справка"

	return text, tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(listBtn),
		tgbotapi.NewInlineKeyboardRow(topicsBtn),
	)
}

// buildSettingsMessage строит сообщение с настройками.
func buildSettingsMessage(showCounts bool, breadcrumbInline bool, showKeyboard bool) (string, tgbotapi.InlineKeyboardMarkup) {
	countsLabel := fmt.Sprintf("🔢 Счётчики: %s", boolLabel(showCounts))
	toggleCounts := tgbotapi.NewInlineKeyboardButtonData(countsLabel, "togglesettings:showcounts")

	breadcrumbLabel := fmt.Sprintf("🍞 Крошки кнопками: %s", boolLabel(breadcrumbInline))
	toggleBreadcrumb := tgbotapi.NewInlineKeyboardButtonData(breadcrumbLabel, "togglesettings:breadcrumb")

	keyboardLabel := fmt.Sprintf("⌨️ Клавиатура: %s", boolLabel(showKeyboard))
	toggleKeyboard := tgbotapi.NewInlineKeyboardButtonData(keyboardLabel, "togglesettings:keyboard")

	backBtn := tgbotapi.NewInlineKeyboardButtonData("◀️ Назад", "backtolist")

	return "⚙️ *Настройки*", tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(toggleCounts),
		tgbotapi.NewInlineKeyboardRow(toggleBreadcrumb),
		tgbotapi.NewInlineKeyboardRow(toggleKeyboard),
		tgbotapi.NewInlineKeyboardRow(backBtn),
	)
}

// boolLabel возвращает «Вкл» или «Выкл» для булева значения.
func boolLabel(v bool) string {
	if v {
		return "Вкл ✅"
	}
	return "Выкл ❌"
}

// now возвращает текущее время (для подстановки в тестах).
var now = time.Now

// buildPriorityMessage строит сообщение выбора приоритета.
func buildPriorityMessage(pendingText string) (string, tgbotapi.InlineKeyboardMarkup) {
	text := fmt.Sprintf("📝 Приоритет:\n\n_%s_", formatPreview(pendingText, 100, 3))
	markup := tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("🔴 Высокий", "prio:3"),
			tgbotapi.NewInlineKeyboardButtonData("🟡 Средний", "prio:2"),
			tgbotapi.NewInlineKeyboardButtonData("🔵 Низкий", "prio:1"),
		),
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("— Без приоритета", "prio:0"),
		),
	)
	return text, markup
}

// prioBtnLabel возвращает текст кнопки переключения приоритета.
func prioBtnLabel(priority int, emoji string) string {
	if priority == model.PriorityNone {
		return "🔄 —"
	}
	return "🔄" + emoji
}

// --- Транслитерация кириллицы для команд ---

var translitMap = map[rune]string{
	'а': "a", 'б': "b", 'в': "v", 'г': "g", 'д': "d", 'е': "e", 'ё': "yo",
	'ж': "zh", 'з': "z", 'и': "i", 'й': "y", 'к': "k", 'л': "l", 'м': "m",
	'н': "n", 'о': "o", 'п': "p", 'р': "r", 'с': "s", 'т': "t", 'у': "u",
	'ф': "f", 'х': "h", 'ц': "ts", 'ч': "ch", 'ш': "sh", 'щ': "sch",
	'ъ': "", 'ы': "y", 'ь': "", 'э': "e", 'ю': "yu", 'я': "ya",
	'А': "A", 'Б': "B", 'В': "V", 'Г': "G", 'Д': "D", 'Е': "E", 'Ё': "Yo",
	'Ж': "Zh", 'З': "Z", 'И': "I", 'Й': "Y", 'К': "K", 'Л': "L", 'М': "M",
	'Н': "N", 'О': "O", 'П': "P", 'Р': "R", 'С': "S", 'Т': "T", 'У': "U",
	'Ф': "F", 'Х': "H", 'Ц': "Ts", 'Ч': "Ch", 'Ш': "Sh", 'Щ': "Sch",
	'Ъ': "", 'Ы': "Y", 'Ь': "", 'Э': "E", 'Ю': "Yu", 'Я': "Ya",
}

// translit преобразует кириллицу в латиницу для использования в /командах.
func translit(s string) string {
	var b strings.Builder
	for _, r := range s {
		if lat, ok := translitMap[r]; ok {
			b.WriteString(lat)
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// buildMoveNavigator строит навигатор для перемещения заметки — с возможностью
// заходить в подпапки и вставлять на любом уровне.
func buildMoveNavigator(
	note model.Note,
	currentTopicID int64,
	currentFolderID *int64,
	folders []model.Folder,
	folderChain []model.Folder,
	allTopics []model.Topic,
) (string, tgbotapi.InlineKeyboardMarkup) {
	text := fmt.Sprintf("Переместить *[#%d]*", note.ID)

	// Имя текущего топика
	topicName := ""
	for _, t := range allTopics {
		if t.ID == currentTopicID {
			topicName = fmt.Sprintf("Директория: [%s]", t.Name)
			break
		}
	}

	// Breadcrumb
	if topicName != "" {
		text += "\n🗓 " + tgbotapi.EscapeText(tgbotapi.ModeMarkdown, topicName)
		for _, f := range folderChain {
			text += " › " + tgbotapi.EscapeText(tgbotapi.ModeMarkdown, f.Name)
		}
	}

	var rows [][]tgbotapi.InlineKeyboardButton

	// 📌 Вставить сюда
	rows = append(rows, tgbotapi.NewInlineKeyboardRow(
		tgbotapi.NewInlineKeyboardButtonData("[Вставить сюда 📩]", "moveinsert"),
	))

	// Папки (можно зайти внутрь)
	for _, f := range folders {
		rows = append(rows, tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData(
				fmt.Sprintf("📁 %s", f.Name),
				fmt.Sprintf("movepick:%d", f.ID),
			),
		))
	}

	// 📤 На уровень выше (если не в корне)
	if currentFolderID != nil {
		rows = append(rows, tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("📤 На уровень выше", "moveup"),
		))
	}

	// Другие топики (переключение контекста)
	for _, t := range allTopics {
		if t.ID == currentTopicID {
			continue
		}
		rows = append(rows, tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData(
				fmt.Sprintf("🗂️ %s", t.Name),
				fmt.Sprintf("movetopic:%d", t.ID),
			),
		))
	}

	// Отмена
	rows = append(rows, tgbotapi.NewInlineKeyboardRow(
		tgbotapi.NewInlineKeyboardButtonData("◀️ Отмена", fmt.Sprintf("movecancel:%d", note.ID)),
	))

	return text, tgbotapi.NewInlineKeyboardMarkup(rows...)
}

// sanitize подготавливает имя для использования в /команде:
// пробелы → _, кириллица → латиница, спецсимволы → _.
func sanitize(name string) string {
	s := strings.ReplaceAll(name, " ", "_")
	s = translit(s)
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			b.WriteRune(r)
		} else if r <= 127 {
			// ASCII-спецсимволы заменяем на _
			b.WriteRune('_')
		}
		// Не-ASCII (эмодзи, кириллица после translit) — пропускаем
	}
	return b.String()
}

// emojiDecoration возвращает только эмодзи (не-буквы за пределами ASCII),
// которые sanitize выбросил бы. Используется для отображения эмодзи рядом с /командой.
func emojiDecoration(name string) string {
	var b strings.Builder
	for _, r := range name {
		if r > 127 && !unicode.IsLetter(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// --- Календарь для напоминаний ---

var monthNames = []string{
	"Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
	"Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
}

var dayNames = []string{"Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"}

// buildCalendar строит календарь на указанный месяц.
func buildCalendar(noteID int64, year int, month time.Month) (string, tgbotapi.InlineKeyboardMarkup) {
	t := time.Date(year, month, 1, 0, 0, 0, 0, time.Local)
	header := fmt.Sprintf("📅 %s %d", monthNames[t.Month()-1], t.Year())

	var rows [][]tgbotapi.InlineKeyboardButton

	// Навигация по месяцам
	prevMonth := t.AddDate(0, -1, 0)
	nextMonth := t.AddDate(0, 1, 0)
	nav := tgbotapi.NewInlineKeyboardRow(
		tgbotapi.NewInlineKeyboardButtonData("◀️", fmt.Sprintf("remcal:%d:%d:%d", noteID, prevMonth.Year(), prevMonth.Month())),
		tgbotapi.NewInlineKeyboardButtonData(header, "none"),
		tgbotapi.NewInlineKeyboardButtonData("▶️", fmt.Sprintf("remcal:%d:%d:%d", noteID, nextMonth.Year(), nextMonth.Month())),
	)
	rows = append(rows, nav)

	// Дни недели
	var dayRow []tgbotapi.InlineKeyboardButton
	for _, d := range dayNames {
		dayRow = append(dayRow, tgbotapi.NewInlineKeyboardButtonData(d, "none"))
	}
	rows = append(rows, dayRow)

	// Дни месяца
	firstDay := int(t.Weekday())
	if firstDay == 0 {
		firstDay = 7 // Воскресенье → 7 (пн-вс)
	}
	daysInMonth := time.Date(year, month+1, 0, 0, 0, 0, 0, time.Local).Day()

	day := 1
	for week := 0; week < 6 && day <= daysInMonth; week++ {
		var row []tgbotapi.InlineKeyboardButton
		for col := 1; col <= 7; col++ {
			if (week == 0 && col < firstDay) || day > daysInMonth {
				row = append(row, tgbotapi.NewInlineKeyboardButtonData(" ", "none"))
			} else {
				row = append(row, tgbotapi.NewInlineKeyboardButtonData(
					fmt.Sprintf("%d", day),
					fmt.Sprintf("remday:%d:%d:%d:%d", noteID, year, month, day),
				))
				day++
			}
		}
		rows = append(rows, row)
	}

	// Кнопки быстрого выбора
	today := now()
	tomorrow := today.AddDate(0, 0, 1)
	quick := tgbotapi.NewInlineKeyboardRow(
		tgbotapi.NewInlineKeyboardButtonData("Сегодня", fmt.Sprintf("remday:%d:%d:%d:%d", noteID, today.Year(), today.Month(), today.Day())),
		tgbotapi.NewInlineKeyboardButtonData("Завтра", fmt.Sprintf("remday:%d:%d:%d:%d", noteID, tomorrow.Year(), tomorrow.Month(), tomorrow.Day())),
	)
	rows = append(rows, quick)

	back := tgbotapi.NewInlineKeyboardRow(
		tgbotapi.NewInlineKeyboardButtonData("◀️ Назад", fmt.Sprintf("view:%d", noteID)),
	)
	rows = append(rows, back)

	return "📅 Выбери дату (местное):", tgbotapi.NewInlineKeyboardMarkup(rows...)
}

// buildHourPicker строит выбор часа.
func buildHourPicker(noteID int64, year int, month time.Month, day int) (string, tgbotapi.InlineKeyboardMarkup) {
	var rows [][]tgbotapi.InlineKeyboardButton

	for start := 0; start < 24; start += 6 {
		var row []tgbotapi.InlineKeyboardButton
		for h := start; h < start+6 && h < 24; h++ {
			row = append(row, tgbotapi.NewInlineKeyboardButtonData(
				fmt.Sprintf("%02d:00", h),
				fmt.Sprintf("remhour:%d:%d:%d:%d:%d", noteID, year, month, day, h),
			))
		}
		rows = append(rows, row)
	}

	back := tgbotapi.NewInlineKeyboardRow(
		tgbotapi.NewInlineKeyboardButtonData("◀️ Назад", fmt.Sprintf("remcal:%d:%d:%d", noteID, year, month)),
	)
	rows = append(rows, back)

	return fmt.Sprintf("⏰ Выбери час (%02d.%02d):", day, month), tgbotapi.NewInlineKeyboardMarkup(rows...)
}

// buildMinutePicker строит выбор минут.
func buildMinutePicker(noteID int64, year int, month time.Month, day, hour int) (string, tgbotapi.InlineKeyboardMarkup) {
	minutes := []int{0, 15, 30, 45}
	var row []tgbotapi.InlineKeyboardButton
	for _, m := range minutes {
		row = append(row, tgbotapi.NewInlineKeyboardButtonData(
			fmt.Sprintf(":%02d", m),
			fmt.Sprintf("remmin:%d:%d:%d:%d:%d:%d", noteID, year, month, day, hour, m),
		))
	}

	back := tgbotapi.NewInlineKeyboardRow(
		tgbotapi.NewInlineKeyboardButtonData("◀️ Назад", fmt.Sprintf("remhour:%d:%d:%d:%d:%d", noteID, year, month, day, hour)),
	)
	return fmt.Sprintf("⏰ Выбери минуты (%02d.%02d %02d:00):", day, month, hour), tgbotapi.NewInlineKeyboardMarkup(row, back)
}
