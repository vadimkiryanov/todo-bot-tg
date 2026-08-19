package telegram

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"todo-bot-tg/internal/model"
)

// --- formatPreview ---

func TestFormatPreview_ShortText(t *testing.T) {
	result := formatPreview("Hello", 50, 1)
	if result != "Hello" {
		t.Errorf("formatPreview = %q, want %q", result, "Hello")
	}
}

func TestFormatPreview_LongText(t *testing.T) {
	longText := "Очень длинный текст заметки, который не должен поместиться в одну строку"
	result := formatPreview(longText, 20, 1)
	if len([]rune(result)) > 23 { // 20 + ...
		t.Errorf("result too long: %q (%d runes)", result, len([]rune(result)))
	}
	if !strings.HasSuffix(result, "...") {
		t.Errorf("truncated text should end with '...': %q", result)
	}
}

func TestFormatPreview_EmptyText(t *testing.T) {
	result := formatPreview("", 50, 1)
	if result != "" {
		t.Errorf("formatPreview = %q, want empty", result)
	}
}

func TestFormatPreview_Multiline(t *testing.T) {
	text := "Line 1\nLine 2\nLine 3\nLine 4"
	result := formatPreview(text, 50, 2)
	lines := strings.Count(result, "\n") + 1
	if lines != 2 {
		t.Errorf("formatPreview returned %d lines, want 2: %q", lines, result)
	}
}

func TestFormatPreview_WhitespaceOnly(t *testing.T) {
	// Все строки из пробелов превращаются в пустые и отбрасываются
	result := formatPreview("   \n  \n   ", 50, 1)
	if result != "" {
		t.Errorf("formatPreview = %q, want empty", result)
	}
}

// --- sanitize ---

func TestSanitize_Simple(t *testing.T) {
	result := sanitize("Hello World")
	if result != "Hello_World" {
		t.Errorf("sanitize = %q, want %q", result, "Hello_World")
	}
}

func TestSanitize_Cyrillic(t *testing.T) {
	result := sanitize("Личное")
	if result != "Lichnoe" {
		t.Errorf("sanitize = %q, want %q", result, "Lichnoe")
	}
}

func TestSanitize_SpecialChars(t *testing.T) {
	result := sanitize("🏠 Личное!")
	// 🏠 → пропускается (эмодзи), space → _, Личное → Lichnoe, ! → _
	if result != "_Lichnoe_" {
		t.Errorf("sanitize = %q, want %q", result, "_Lichnoe_")
	}
}

// --- translit ---

func TestTranslit_Common(t *testing.T) {
	tests := []struct {
		input, want string
	}{
		{"Привет", "Privet"},
		{"Мир", "Mir"},
		{"Работа", "Rabota"},
		{"Привет мир", "Privet mir"},
		{"Hello", "Hello"},
	}

	for _, tt := range tests {
		got := translit(tt.input)
		if got != tt.want {
			t.Errorf("translit(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

// --- prioBtnLabel ---

func TestPrioBtnLabel(t *testing.T) {
	tests := []struct {
		priority model.Priority
		emoji    string
		want     string
	}{
		{model.PriorityHigh, "�", "🔄�"},
		{model.PriorityMedium, "🟡", "🔄🟡"},
		{model.PriorityLow, "🔵", "🔄🔵"},
		{model.PriorityNone, "", "🔄 —"},
	}

	for _, tt := range tests {
		got := prioBtnLabel(tt.priority, tt.emoji)
		if got != tt.want {
			t.Errorf("prioBtnLabel(%d, %q) = %q, want %q", tt.priority, tt.emoji, got, tt.want)
		}
	}
}

// --- buildHelpMessage ---

func TestBuildHelpMessage(t *testing.T) {
	text, markup := buildHelpMessage()
	if text == "" {
		t.Error("buildHelpMessage() returned empty text")
	}
	if len(markup.InlineKeyboard) == 0 {
		t.Error("buildHelpMessage() returned empty keyboard")
	}
}

// --- buildPriorityMessage ---

func TestBuildPriorityMessage(t *testing.T) {
	text, markup := buildPriorityMessage("Сходить в магазин")
	if !strings.Contains(text, "Сходить в магазин") {
		t.Errorf("text does not contain pending text: %q", text)
	}
	if len(markup.InlineKeyboard) != 2 {
		t.Errorf("keyboard rows = %d, want 2", len(markup.InlineKeyboard))
	}
}

func TestBuildPriorityMessage_EscapesSpecialChars(t *testing.T) {
	text, _ := buildPriorityMessage("Купить_хлеб *финал*")
	if !strings.Contains(text, "Купить\\_хлеб \\*финал\\*") {
		t.Errorf("text = %q, want escaped special chars", text)
	}
}

// --- buildDeleteConfirmMessage ---

func TestBuildDeleteConfirmMessage(t *testing.T) {
	note := model.Note{ID: 42, Text: "Test note"}
	text, markup := buildDeleteConfirmMessage(note)
	if !strings.Contains(text, "#42") {
		t.Errorf("text does not contain note ID: %q", text)
	}
	if len(markup.InlineKeyboard) != 1 {
		t.Errorf("keyboard rows = %d, want 1", len(markup.InlineKeyboard))
	}
}

func TestBuildDeleteConfirmMessage_EscapesSpecialChars(t *testing.T) {
	note := model.Note{ID: 43, Text: "Купить_хлеб *финал*"}
	text, _ := buildDeleteConfirmMessage(note)
	if !strings.Contains(text, "Купить\\_хлеб \\*финал\\*") {
		t.Errorf("text = %q, want escaped special chars", text)
	}
}

// --- buildViewNoteMessage ---

func TestBuildViewNoteMessage(t *testing.T) {
	note := model.Note{ID: 1, Text: "Test note", Priority: model.PriorityHigh}
	text, markup := buildViewNoteMessage(note, false, 0)
	if !strings.Contains(text, "#1") {
		t.Errorf("text does not contain note ID: %q", text)
	}
	if !strings.Contains(text, "🔴") {
		t.Errorf("text does not contain priority emoji: %q", text)
	}
	if len(markup.InlineKeyboard) != 2 {
		t.Errorf("keyboard rows = %d, want 2", len(markup.InlineKeyboard))
	}
}

func TestBuildViewNoteMessage_WithReminder(t *testing.T) {
	reminder := time.Date(2026, 8, 6, 15, 0, 0, 0, time.UTC)
	note := model.Note{ID: 1, Text: "Test", ReminderAt: &reminder}
	text, _ := buildViewNoteMessage(note, false, 0)
	if !strings.Contains(text, "⏰") {
		t.Errorf("text does not contain reminder emoji: %q", text)
	}
}

func TestBuildViewNoteMessage_Pinned(t *testing.T) {
	note := model.Note{ID: 1, Text: "Test", Pinned: true}
	text, markup := buildViewNoteMessage(note, false, 0)

	if !strings.Contains(text, "📌 Закреплена") {
		t.Errorf("text does not contain pinned line: %q", text)
	}

	// Первая строка кнопок: [✏️, ✅/🔄, ⏰, 📎, 📌, ···] — pin на 5-й позиции
	row := markup.InlineKeyboard[0]
	pinBtn := row[4]
	if pinBtn.Text != "📌" {
		t.Errorf("pin button text = %q, want %q", pinBtn.Text, "📌")
	}
	// 📌 всегда открывает меню закрепления
	if pinBtn.CallbackData == nil || *pinBtn.CallbackData != "pin:1" {
		t.Errorf("pin button callback = %v, want 'pin:1' (меню закрепления)", pinBtn.CallbackData)
	}
}

func TestBuildViewNoteMessage_PinnedUntil(t *testing.T) {
	until := time.Date(2099, 1, 2, 12, 4, 0, 0, time.UTC)
	note := model.Note{ID: 1, Text: "Test", Pinned: true, PinnedUntil: &until}
	text, _ := buildViewNoteMessage(note, false, 0)

	// Срок закрепления показывается в локальном времени пользователя (tz=0 → МСК, UTC+3)
	if !strings.Contains(text, "📌 Закреплена до 02.01.2099 15:04") {
		t.Errorf("text does not contain pinned-until line: %q", text)
	}
}

func TestBuildViewNoteMessage_NotPinned(t *testing.T) {
	note := model.Note{ID: 2, Text: "Test"}
	_, markup := buildViewNoteMessage(note, false, 0)

	row := markup.InlineKeyboard[0]
	pinBtn := row[4]
	if pinBtn.Text != "📌" {
		t.Errorf("pin button text = %q, want %q", pinBtn.Text, "📌")
	}
	if pinBtn.CallbackData == nil || *pinBtn.CallbackData != "pin:2" {
		t.Errorf("pin button callback = %v, want 'pin:2' (меню закрепления)", pinBtn.CallbackData)
	}
}

func TestBuildPinMenu_NotPinned(t *testing.T) {
	note := model.Note{ID: 7, Text: "Test"}
	text, markup := buildPinMenu(note, 0)

	if !strings.Contains(text, "📌 Закрепление") {
		t.Errorf("text does not contain title: %q", text)
	}
	// Постоянно + На время, затем Назад. Без «Открепить» (не закреплена).
	if len(markup.InlineKeyboard) != 2 {
		t.Fatalf("keyboard rows = %d, want 2", len(markup.InlineKeyboard))
	}
	row0 := markup.InlineKeyboard[0]
	if row0[0].CallbackData == nil || *row0[0].CallbackData != "pinforever:7" {
		t.Errorf("btn[0][0] callback = %v, want 'pinforever:7'", row0[0].CallbackData)
	}
	if row0[1].CallbackData == nil || *row0[1].CallbackData != "pintime:7" {
		t.Errorf("btn[0][1] callback = %v, want 'pintime:7'", row0[1].CallbackData)
	}
	lastRow := markup.InlineKeyboard[len(markup.InlineKeyboard)-1]
	if lastRow[0].CallbackData == nil || *lastRow[0].CallbackData != "view:7" {
		t.Errorf("back callback = %v, want 'view:7'", lastRow[0].CallbackData)
	}
}

func TestBuildPinMenu_Pinned(t *testing.T) {
	note := model.Note{ID: 7, Text: "Test", Pinned: true}
	_, markup := buildPinMenu(note, 0)

	// Постоянно + На время, Открепить, Назад → 3 строки
	if len(markup.InlineKeyboard) != 3 {
		t.Fatalf("keyboard rows = %d, want 3", len(markup.InlineKeyboard))
	}
	unpinRow := markup.InlineKeyboard[1]
	if unpinRow[0].CallbackData == nil || *unpinRow[0].CallbackData != "unpin:7" {
		t.Errorf("unpin callback = %v, want 'unpin:7'", unpinRow[0].CallbackData)
	}
}

func TestBuildPinTimeMenu(t *testing.T) {
	note := model.Note{ID: 5, Text: "Test"}
	text, markup := buildPinTimeMenu(note, 0)

	if !strings.Contains(text, "На сколько") {
		t.Errorf("text does not contain prompt: %q", text)
	}
	// 1 час / 12 часов, Своё время, Назад → 3 строки
	if len(markup.InlineKeyboard) != 3 {
		t.Fatalf("keyboard rows = %d, want 3", len(markup.InlineKeyboard))
	}
	row0 := markup.InlineKeyboard[0]
	if row0[0].CallbackData == nil || *row0[0].CallbackData != "pinhours:5:1" {
		t.Errorf("btn[0][0] callback = %v, want 'pinhours:5:1'", row0[0].CallbackData)
	}
	if row0[1].CallbackData == nil || *row0[1].CallbackData != "pinhours:5:12" {
		t.Errorf("btn[0][1] callback = %v, want 'pinhours:5:12'", row0[1].CallbackData)
	}
	customRow := markup.InlineKeyboard[1]
	if customRow[0].CallbackData == nil || !strings.HasPrefix(*customRow[0].CallbackData, "pincal:5:") {
		t.Errorf("custom callback = %v, want prefix 'pincal:5:'", customRow[0].CallbackData)
	}
	lastRow := markup.InlineKeyboard[2]
	if lastRow[0].CallbackData == nil || *lastRow[0].CallbackData != "pin:5" {
		t.Errorf("back callback = %v, want 'pin:5'", lastRow[0].CallbackData)
	}
}

func TestBuildListMessage_PinnedMarker(t *testing.T) {
	items := []listItem{
		{note: model.Note{ID: 1, Text: "Обычная", Priority: model.PriorityHigh}},
		{note: model.Note{ID: 2, Text: "Закреплённая", Pinned: true}},
	}
	_, markup := buildListMessage(items, 0, "", nil, nil, 0, 1, false, false, false, 0, false)

	// topicID=0 → первая строка «🔝 Топики», затем заметки по порядку
	normalBtn := markup.InlineKeyboard[1][0]
	if strings.HasPrefix(normalBtn.Text, "📌 ") {
		t.Errorf("normal note button should not have pin marker: %q", normalBtn.Text)
	}

	pinnedBtn := markup.InlineKeyboard[2][0]
	if !strings.HasPrefix(pinnedBtn.Text, "📌 ") {
		t.Errorf("pinned note button = %q, want prefix %q", pinnedBtn.Text, "📌 ")
	}
}

// --- buildQuickTopicsMessage (отдельное сообщение) ---

func TestBuildQuickTopicsMessage(t *testing.T) {
	topics := []model.Topic{
		{ID: 1, UserID: 1, Name: "🏠 Личное"},
		{ID: 2, UserID: 1, Name: "💼 Работа"},
	}
	text, markup := buildQuickTopicsMessage(topics, 1)

	// Текст — непустой (минималистичный UI)
	if strings.TrimSpace(text) == "" {
		t.Errorf("text = %q, want non-empty", text)
	}
	// Одна строка кнопок — по одной на каждый быстрый топик
	if len(markup.InlineKeyboard) != 1 {
		t.Fatalf("keyboard rows = %d, want 1", len(markup.InlineKeyboard))
	}
	row := markup.InlineKeyboard[0]
	if len(row) != 2 {
		t.Fatalf("quick topics row buttons = %d, want 2", len(row))
	}
	// Текущий топик помечен галочкой
	if row[0].CallbackData == nil || *row[0].CallbackData != "settopic:1" {
		t.Errorf("first quick button callback = %v, want 'settopic:1'", row[0].CallbackData)
	}
	if !strings.HasPrefix(row[0].Text, "✅ ") {
		t.Errorf("current topic button = %q, want prefix '✅ '", row[0].Text)
	}
	if row[1].CallbackData == nil || *row[1].CallbackData != "settopic:2" {
		t.Errorf("second quick button callback = %v, want 'settopic:2'", row[1].CallbackData)
	}
	if strings.HasPrefix(row[1].Text, "✅ ") {
		t.Errorf("non-current topic button = %q, should not have checkmark", row[1].Text)
	}
}

func TestBuildQuickTopicsMessage_NoCurrentTopic(t *testing.T) {
	topics := []model.Topic{
		{ID: 1, UserID: 1, Name: "🏠 Личное"},
	}
	// currentTopicID=0 (режим «все заметки») — без галочки
	_, markup := buildQuickTopicsMessage(topics, 0)

	row := markup.InlineKeyboard[0]
	if len(row) != 1 {
		t.Fatalf("quick topics row buttons = %d, want 1", len(row))
	}
	if strings.HasPrefix(row[0].Text, "✅ ") {
		t.Errorf("quick button = %q, should not have checkmark when no current topic", row[0].Text)
	}
}

func TestBuildQuickTopicsMessage_EmptyName(t *testing.T) {
	topics := []model.Topic{
		{ID: 1, UserID: 1, Name: "   "},
	}
	_, markup := buildQuickTopicsMessage(topics, 0)

	row := markup.InlineKeyboard[0]
	if len(row) != 1 {
		t.Fatalf("quick topics row buttons = %d, want 1", len(row))
	}
	// Пустое название → placeholder «...»
	if row[0].Text != "..." {
		t.Errorf("button text = %q, want '...'", row[0].Text)
	}
}

// --- buildQuickPickMessage (экран выбора топиков) ---

func TestBuildQuickPickMessage(t *testing.T) {
	topics := []model.Topic{
		{ID: 1, UserID: 1, Name: "🏠 Личное"},
		{ID: 2, UserID: 1, Name: "💼 Работа"},
		{ID: 3, UserID: 1, Name: "📚 Учёба"},
	}
	text, markup := buildQuickPickMessage(topics, []int64{2}, 4)

	// Текст показывает текущее количество
	if text != "🚀 Быстрые топики (4)" {
		t.Errorf("text = %q, want '🚀 Быстрые топики (4)'", text)
	}
	// По кнопке на топик + кнопка «Назад»
	if len(markup.InlineKeyboard) != 4 {
		t.Fatalf("keyboard rows = %d, want 4", len(markup.InlineKeyboard))
	}
	// Выбранный топик помечен галочкой
	row2 := markup.InlineKeyboard[1]
	if len(row2) != 1 || row2[0].CallbackData == nil || *row2[0].CallbackData != "quicktoggle:2" {
		t.Fatalf("second row = %+v, want quicktoggle:2", row2)
	}
	if !strings.HasPrefix(row2[0].Text, "✅ ") {
		t.Errorf("selected topic button = %q, want prefix '✅ '", row2[0].Text)
	}
	// Невыбранный топик — без галочки
	row1 := markup.InlineKeyboard[0]
	if strings.HasPrefix(row1[0].Text, "✅ ") {
		t.Errorf("unselected topic button = %q, should not have checkmark", row1[0].Text)
	}
	// Последняя строка — «Назад» в настройки
	last := markup.InlineKeyboard[3]
	if len(last) != 1 || last[0].CallbackData == nil || *last[0].CallbackData != "togglesettings:back" {
		t.Errorf("last row = %+v, want 'togglesettings:back'", last)
	}
}

func TestBuildQuickPickMessage_NoTopics(t *testing.T) {
	_, markup := buildQuickPickMessage(nil, nil, 2)
	// Только кнопка «Назад»
	if len(markup.InlineKeyboard) != 1 {
		t.Fatalf("keyboard rows = %d, want 1", len(markup.InlineKeyboard))
	}
}

// --- filterQuickTopics ---

func TestFilterQuickTopics_KeepsOrderAndDropsMissing(t *testing.T) {
	all := []model.Topic{
		{ID: 1, UserID: 1, Name: "A"},
		{ID: 2, UserID: 1, Name: "B"},
		{ID: 3, UserID: 1, Name: "C"},
	}
	// Порядок выбора сохраняется; удалённый топик (99) отбрасывается
	got := filterQuickTopics(all, []int64{3, 99, 1})
	if len(got) != 2 || got[0].ID != 3 || got[1].ID != 1 {
		t.Errorf("filterQuickTopics() = %+v, want [3 1]", got)
	}
}

func TestFilterQuickTopics_EmptySelection(t *testing.T) {
	all := []model.Topic{{ID: 1, UserID: 1, Name: "A"}}
	if got := filterQuickTopics(all, nil); len(got) != 0 {
		t.Errorf("filterQuickTopics(nil) = %+v, want empty", got)
	}
}

// --- buildReminderMenu ---

func TestBuildReminderMenu(t *testing.T) {
	note := model.Note{ID: 5}
	text, markup := buildReminderMenu(note, 0)
	if text == "" {
		t.Error("buildReminderMenu() returned empty text")
	}
	if len(markup.InlineKeyboard) != 2 {
		t.Errorf("keyboard rows = %d, want 2", len(markup.InlineKeyboard))
	}
}

// --- buildTopicsMessage ---

func TestBuildTopicsMessage(t *testing.T) {
	topics := []model.Topic{
		{ID: 1, UserID: 1, Name: "🏠 Личное"},
		{ID: 2, UserID: 1, Name: "💼 Работа"},
	}
	counts := map[int64]int{1: 3, 2: 5}
	text, markup := buildTopicsMessage(topics, 1, 1, counts, nil, true)
	if !strings.Contains(text, "Топики") {
		t.Errorf("text does not contain header: %q", text)
	}
	// 2 rows: "Все" + топики (2 штуки в одном ряду)
	if len(markup.InlineKeyboard) != 2 {
		t.Errorf("keyboard rows = %d, want 2", len(markup.InlineKeyboard))
	}
	if len(markup.InlineKeyboard[1]) != 2 {
		t.Errorf("topic row buttons = %d, want 2", len(markup.InlineKeyboard[1]))
	}
}

// --- TestBuildTopicsMessage_WithFolders ---

func TestBuildTopicsMessage_WithFolders(t *testing.T) {
	topics := []model.Topic{
		{ID: 1, UserID: 1, Name: "🏠 Личное"},
	}
	counts := map[int64]int{1: 3}
	folderCounts := map[int64]int{1: 2}
	text, markup := buildTopicsMessage(topics, 0, 1, counts, folderCounts, true)
	if !strings.Contains(text, "Топики") {
		t.Errorf("text does not contain header: %q", text)
	}
	btn0 := markup.InlineKeyboard[0][0].Text
	if !strings.Contains(btn0, "3📝") || !strings.Contains(btn0, "2📁") {
		t.Errorf("button does not contain counts: %q", btn0)
	}
}

// --- TestBuildTopicsMessage_NoCounts ---

func TestBuildTopicsMessage_NoCounts(t *testing.T) {
	topics := []model.Topic{
		{ID: 1, UserID: 1, Name: "🏠 Личное"},
	}
	counts := map[int64]int{1: 3}
	folderCounts := map[int64]int{1: 2}
	text, markup := buildTopicsMessage(topics, 0, 1, counts, folderCounts, false)
	if !strings.Contains(text, "Топики") {
		t.Errorf("text does not contain header: %q", text)
	}
	btn0 := markup.InlineKeyboard[0][0].Text
	if strings.Contains(btn0, "📝") || strings.Contains(btn0, "📁") {
		t.Errorf("button should not contain counts when disabled: %q", btn0)
	}
}

// --- TestBuildTopicsMessage_ThreePerRow ---

func TestBuildTopicsMessage_ThreePerRow(t *testing.T) {
	topics := make([]model.Topic, 7)
	for i := range topics {
		topics[i] = model.Topic{ID: int64(i + 1), UserID: 1, Name: fmt.Sprintf("T%d", i+1)}
	}
	counts := make(map[int64]int, len(topics))
	for _, tp := range topics {
		counts[tp.ID] = 1
	}
	_, markup := buildTopicsMessage(topics, 0, 1, counts, nil, false)

	// Ряды: "Все" + 3 ряда топиков (3, 3, 1)
	if len(markup.InlineKeyboard) != 4 {
		t.Errorf("keyboard rows = %d, want 4", len(markup.InlineKeyboard))
	}
	if len(markup.InlineKeyboard[1]) != 3 || len(markup.InlineKeyboard[2]) != 3 || len(markup.InlineKeyboard[3]) != 1 {
		t.Errorf(
			"topic row sizes = %d,%d,%d, want 3,3,1",
			len(markup.InlineKeyboard[1]), len(markup.InlineKeyboard[2]), len(markup.InlineKeyboard[3]),
		)
	}
	if markup.InlineKeyboard[3][0].CallbackData == nil || *markup.InlineKeyboard[3][0].CallbackData != "settopic:7" {
		t.Errorf("last topic button callback = %v, want settopic:7", markup.InlineKeyboard[3][0].CallbackData)
	}
}

// --- buildArchivedMessage ---

func TestBuildArchivedMessage_Empty(t *testing.T) {
	text, markup := buildArchivedMessage(nil)
	if !strings.Contains(text, "пуст") {
		t.Errorf("text does not contain 'empty': %q", text)
	}
	if len(markup.InlineKeyboard) != 1 {
		t.Errorf("keyboard rows = %d, want 1", len(markup.InlineKeyboard))
	}
}

func TestBuildArchivedMessage_WithNotes(t *testing.T) {
	notes := []model.Note{
		{ID: 1, Text: "Note 1"},
		{ID: 2, Text: "Note 2"},
	}
	text, markup := buildArchivedMessage(notes)
	if !strings.Contains(text, "(2)") {
		t.Errorf("text does not contain count: %q", text)
	}
	// 2 note rows + 1 back row
	if len(markup.InlineKeyboard) != 3 {
		t.Errorf("keyboard rows = %d, want 3", len(markup.InlineKeyboard))
	}
}

// --- buildListMessage ---

func TestBuildListMessage_Empty(t *testing.T) {
	text, markup := buildListMessage(nil, 0, "", nil, nil, 0, 1, true, false, false, 0, false)
	if text == "" {
		t.Error("buildListMessage() returned empty text")
	}
	// Должна быть кнопка "Добавить заметку"
	if len(markup.InlineKeyboard) != 1 {
		t.Errorf("keyboard rows = %d, want 1", len(markup.InlineKeyboard))
	}
}

func TestBuildListMessage_WithPagination(t *testing.T) {
	items := make([]listItem, 10)
	for i := range items {
		items[i] = listItem{note: model.Note{ID: int64(i + 1), Text: "Test"}}
	}
	text, markup := buildListMessage(items, 0, "", nil, nil, 0, 2, true, false, false, 0, false)
	if !strings.Contains(text, "Все заметки") {
		t.Errorf("text does not contain header: %q", text)
	}
	// 10 note buttons + 1 "🔝 Топики" row + 1 pagination row = 12
	if len(markup.InlineKeyboard) != 12 {
		t.Errorf("keyboard rows = %d, want 12", len(markup.InlineKeyboard))
	}
}

// --- buildListMessage: виртуальная папка выполненных ---

func TestBuildListMessage_WithDoneFolder(t *testing.T) {
	// doneCount=3 → кнопка «✅ Выполненные (3)» внизу
	items := []listItem{
		{isFolder: true, folder: model.Folder{ID: 1, Name: "Папка"}},
		{note: model.Note{ID: 1, Text: "Заметка"}},
	}
	_, markup := buildListMessage(items, 1, "Личное", nil, nil, 0, 1, false, false, false, 3, false)

	// Порядок: папка + заметка + done folder = 3 (breadcrumb текстовый, не кнопка)
	if len(markup.InlineKeyboard) != 3 {
		t.Fatalf("keyboard rows = %d, want 3", len(markup.InlineKeyboard))
	}
	// Проверяем последнюю строку — должна быть «✅ Выполненные (3)»
	lastRow := markup.InlineKeyboard[len(markup.InlineKeyboard)-1]
	lastBtn := lastRow[0]
	if lastBtn.Text != "✅ Выполненные (3)" {
		t.Errorf("last button = %q, want %q", lastBtn.Text, "✅ Выполненные (3)")
	}
	if lastBtn.CallbackData == nil || *lastBtn.CallbackData != "donefolder" {
		t.Errorf("last button callback = %v, want 'donefolder'", lastBtn.CallbackData)
	}
}

func TestBuildListMessage_NoDoneFolder_ZeroCount(t *testing.T) {
	// doneCount=0 → нет кнопки выполненных
	items := []listItem{
		{note: model.Note{ID: 1, Text: "Заметка"}},
	}
	_, markup := buildListMessage(items, 1, "Личное", nil, nil, 0, 1, false, false, false, 0, false)

	for _, row := range markup.InlineKeyboard {
		for _, btn := range row {
			if strings.Contains(btn.Text, "Выполненные") {
				t.Error("done folder button found when doneCount=0")
			}
		}
	}
}

func TestBuildListMessage_DoneFolder_InSubfolder(t *testing.T) {
	// doneCount>0 + currentFolderID != nil → кнопка выполненных показывается
	items := []listItem{
		{note: model.Note{ID: 1, Text: "Заметка"}},
	}
	fid := int64(5)
	_, markup := buildListMessage(items, 1, "Личное", &fid, nil, 0, 1, false, false, false, 5, false)

	// Ищем кнопку «✅ Выполненные»
	found := false
	for _, row := range markup.InlineKeyboard {
		for _, btn := range row {
			if strings.Contains(btn.Text, "Выполненные") {
				found = true
			}
		}
	}
	if !found {
		t.Error("done folder button NOT found when in subfolder with doneCount>0")
	}
}

func TestBuildListMessage_NoDoneFolder_AllNotes(t *testing.T) {
	// doneCount>0 но topicID=0 (режим «все заметки») → нет кнопки
	items := []listItem{
		{note: model.Note{ID: 1, Text: "Заметка"}},
	}
	_, markup := buildListMessage(items, 0, "", nil, nil, 0, 1, false, false, false, 3, false)

	for _, row := range markup.InlineKeyboard {
		for _, btn := range row {
			if strings.Contains(btn.Text, "Выполненные") {
				t.Error("done folder button found in 'all notes' mode")
			}
		}
	}
}

func TestBuildListMessage_DoneFolderActive(t *testing.T) {
	// doneFolderActive=true → текстовый breadcrumb с «✅ Выполненные» (не /DONE)
	items := []listItem{
		{note: model.Note{ID: 1, Text: "Готово", Done: true}},
	}
	text, markup := buildListMessage(items, 1, "Личное", nil, nil, 0, 1, false, false, false, 0, true)

	// Текст НЕ должен содержать /DONE (это фейковая команда)
	if strings.Contains(text, "/DONE") {
		t.Errorf("text should not contain /DONE: %q", text)
	}
	// Текст должен содержать «✅ Выполненные»
	if !strings.Contains(text, "✅ Выполненные") {
		t.Errorf("text should contain ✅ Выполненные: %q", text)
	}
	// Последняя кнопка — «◀️ Назад» с callback «backtolist»
	lastRow := markup.InlineKeyboard[len(markup.InlineKeyboard)-1]
	lastBtn := lastRow[0]
	if lastBtn.Text != "◀️ Назад" {
		t.Errorf("last button = %q, want %q", lastBtn.Text, "◀️ Назад")
	}
	if lastBtn.CallbackData == nil || *lastBtn.CallbackData != "backtolist" {
		t.Errorf("last button callback = %v, want 'backtolist'", lastBtn.CallbackData)
	}
}

func TestBuildListMessage_DoneFolderActive_InlineBreadcrumb(t *testing.T) {
	// doneFolderActive=true + breadcrumbInline=true → крошка «✅ Выполненные» с callback=none
	items := []listItem{
		{note: model.Note{ID: 1, Text: "Готово", Done: true}},
	}
	_, markup := buildListMessage(items, 1, "Личное", nil, nil, 0, 1, false, true, false, 0, true)

	// Первая строка — breadcrumb, последняя кнопка в ней — «✅ Выполненные»
	crumbRow := markup.InlineKeyboard[0]
	doneCrumb := crumbRow[len(crumbRow)-1]
	if doneCrumb.Text != "✅ Выполненные" {
		t.Errorf("crumb done text = %q, want %q", doneCrumb.Text, "✅ Выполненные")
	}
	if doneCrumb.CallbackData == nil || *doneCrumb.CallbackData != "none" {
		t.Errorf("crumb done callback = %v, want 'none'", doneCrumb.CallbackData)
	}
}

func TestBuildListMessage_InlineBreadcrumb_SkipsCurrentFolder(t *testing.T) {
	// Текущая папка не показывается в inline-крошках — она вынесена в заголовок
	items := []listItem{
		{note: model.Note{ID: 1, Text: "Заметка"}},
	}
	fid := int64(2)
	folderChain := []model.Folder{
		{ID: 1, Name: "Родитель"},
		{ID: 2, Name: "Текущая"},
	}
	text, markup := buildListMessage(items, 1, "Личное", &fid, folderChain, 0, 1, false, true, false, 0, false)

	// В крошках — только родитель, текущая папка не кнопка
	crumbRow := markup.InlineKeyboard[0]
	var crumbTexts []string
	for _, btn := range crumbRow {
		crumbTexts = append(crumbTexts, btn.Text)
	}
	joined := strings.Join(crumbTexts, "|")
	if strings.Contains(joined, "Текущая") {
		t.Errorf("current folder should NOT be in crumbs: %v", crumbTexts)
	}
	if !strings.Contains(joined, "📁 Родитель") {
		t.Errorf("parent folder should be in crumbs: %v", crumbTexts)
	}
	// Заголовок: полный путь без внешних скобок, текущая папка в [ ]
	if !strings.Contains(text, "Личное › Родитель › [Текущая]") {
		t.Errorf("header should be 'Личное › Родитель › [Текущая]': %q", text)
	}
	if strings.Contains(text, "[Родитель]") {
		t.Errorf("parent folder should NOT be in brackets: %q", text)
	}
}

func TestBuildListMessage_InlineBreadcrumb_RootTopic(t *testing.T) {
	// В корне топика (без папок) заголовок — только топик, крошки: ТОПИКИ + топик
	items := []listItem{
		{note: model.Note{ID: 1, Text: "Заметка"}},
	}
	text, markup := buildListMessage(items, 1, "Личное", nil, nil, 0, 1, false, true, false, 0, false)

	crumbRow := markup.InlineKeyboard[0]
	if len(crumbRow) != 1 {
		t.Errorf("crumb row len = %d, want 1 (только ТОПИКИ — топик скрыт в корне)", len(crumbRow))
	}
	if crumbRow[0].Text != "📔 ТОПИКИ" {
		t.Errorf("crumb button = %q, want '📔 ТОПИКИ'", crumbRow[0].Text)
	}
	// В корне — заголовок просто название топика, без скобок
	if text != "Личное" {
		t.Errorf("header should be 'Личное' without brackets: %q", text)
	}
	if strings.Contains(text, "›") {
		t.Errorf("header should not contain folder separator: %q", text)
	}
}

func TestBuildListMessage_Ordering_FoldersBeforeNotesBeforeDone(t *testing.T) {
	// Папки → заметки → done → пагинация
	items := []listItem{
		{isFolder: true, folder: model.Folder{ID: 1, Name: "Папка"}},
		{note: model.Note{ID: 2, Text: "Заметка"}},
	}
	_, markup := buildListMessage(items, 1, "Личное", nil, nil, 0, 1, false, false, false, 1, false)

	// папка + заметка + done + пагинации нет (totalPages=1) = 3 (breadcrumb текстовый)
	if len(markup.InlineKeyboard) != 3 {
		t.Fatalf("keyboard rows = %d, want 3", len(markup.InlineKeyboard))
	}
	// Строка 0 — папка
	row := markup.InlineKeyboard[0]
	if !strings.Contains(row[0].Text, "📁 Папка") {
		t.Errorf("row 0 = %q, want folder", row[0].Text)
	}
	// Строка 1 — заметка
	row = markup.InlineKeyboard[1]
	if !strings.Contains(row[0].Text, "Заметка") {
		t.Errorf("row 1 = %q, want note", row[0].Text)
	}
	// Строка 2 — done
	row = markup.InlineKeyboard[2]
	if row[0].Text != "✅ Выполненные (1)" {
		t.Errorf("row 2 = %q, want done folder", row[0].Text)
	}
}

func TestBuildListMessage_DoneFolderActive_InSubfolder_NoDoubleBack(t *testing.T) {
	// doneFolderActive + currentFolderID != nil → только одна кнопка «◀️ Назад» (backtolist)
	items := []listItem{
		{note: model.Note{ID: 1, Text: "Готово", Done: true}},
	}
	fid := int64(5)
	folderChain := []model.Folder{{ID: 5, Name: "МояПапка"}}
	_, markup := buildListMessage(items, 1, "Личное", &fid, folderChain, 0, 1, false, false, false, 0, true)

	// Считаем кнопки «Назад»
	backCount := 0
	for _, row := range markup.InlineKeyboard {
		for _, btn := range row {
			if btn.Text == "◀️ Назад" {
				backCount++
			}
		}
	}
	if backCount != 1 {
		t.Errorf("back buttons = %d, want 1 (duplicate!)", backCount)
	}
	// Проверяем что это именно backtolist, а не backfolder
	lastRow := markup.InlineKeyboard[len(markup.InlineKeyboard)-1]
	if lastRow[0].CallbackData == nil || *lastRow[0].CallbackData != "backtolist" {
		t.Errorf("last button callback = %v, want 'backtolist'", lastRow[0].CallbackData)
	}
}

func TestBuildListMessage_DoneWithPagination(t *testing.T) {
	// done + пагинация: done перед пагинацией
	items := make([]listItem, 10)
	for i := range items {
		items[i] = listItem{note: model.Note{ID: int64(i + 1), Text: "T"}}
	}
	_, markup := buildListMessage(items, 1, "Работа", nil, nil, 0, 2, false, false, false, 2, false)

	// breadcrumb текстовый: 10 заметок + done(1) + pagination(1) = 12
	if len(markup.InlineKeyboard) != 12 {
		t.Fatalf("keyboard rows = %d, want 12", len(markup.InlineKeyboard))
	}
	// Предпоследняя — done
	doneRow := markup.InlineKeyboard[10]
	if doneRow[0].Text != "✅ Выполненные (2)" {
		t.Errorf("pre-last row = %q, want done folder", doneRow[0].Text)
	}
	// Последняя — пагинация
	pagRow := markup.InlineKeyboard[11]
	if !strings.Contains(pagRow[0].Text, "/") {
		t.Errorf("last row = %q, want pagination", pagRow[0].Text)
	}
}

// --- buildCalendar ---

func TestBuildCalendar(t *testing.T) {
	now = func() time.Time { return time.Date(2026, 8, 6, 12, 0, 0, 0, time.UTC) }
	defer func() { now = time.Now }()

	text, markup := buildCalendar(1, 2026, 8, 0, "rem")
	if !strings.Contains(text, "Выбери дату") {
		t.Errorf("text does not contain prompt: %q", text)
	}
	// nav row + day names row + up to 6 week rows + quick row + back row
	if len(markup.InlineKeyboard) < 4 {
		t.Errorf("keyboard rows = %d, want >= 4", len(markup.InlineKeyboard))
	}
}

// --- buildHourPicker ---

func TestBuildHourPicker(t *testing.T) {
	text, markup := buildHourPicker(1, 2026, 8, 6, 0, "rem")
	if !strings.Contains(text, "Выбери час") {
		t.Errorf("text does not contain prompt: %q", text)
	}
	// 4 rows of hours + 1 back row
	if len(markup.InlineKeyboard) != 5 {
		t.Errorf("keyboard rows = %d, want 5", len(markup.InlineKeyboard))
	}
}

// --- buildMinuteRangePicker / buildMinuteExactPicker ---

func TestBuildMinuteRangePicker(t *testing.T) {
	text, markup := buildMinuteRangePicker(1, 2026, 8, 6, 15, 0, "rem")
	if !strings.Contains(text, "Выбери минуты") {
		t.Errorf("text does not contain prompt: %q", text)
	}
	// 1 range row + 1 back row
	if len(markup.InlineKeyboard) != 2 {
		t.Errorf("keyboard rows = %d, want 2", len(markup.InlineKeyboard))
	}
}

func TestBuildMinuteExactPicker(t *testing.T) {
	text, markup := buildMinuteExactPicker(1, 2026, 8, 6, 15, 0, 0, "rem")
	if !strings.Contains(text, "Выбери минуты") {
		t.Errorf("text does not contain prompt: %q", text)
	}
	// 3 rows of 5 + 1 back row = 4
	if len(markup.InlineKeyboard) != 4 {
		t.Errorf("keyboard rows = %d, want 4", len(markup.InlineKeyboard))
	}
}

// --- buildMoveNavigator ---

func TestBuildMoveNavigator(t *testing.T) {
	note := model.Note{ID: 42}
	folders := []model.Folder{
		{ID: 1, Name: "Folder 1"},
	}
	topics := []model.Topic{
		{ID: 1, Name: "Current"},
		{ID: 2, Name: "Other"},
	}
	text, markup := buildMoveNavigator(note, 1, nil, folders, nil, topics)
	if !strings.Contains(text, "#42") {
		t.Errorf("text does not contain note ID: %q", text)
	}
	// insert + 1 folder + 1 other topic + cancel = 4 rows
	if len(markup.InlineKeyboard) != 4 {
		t.Errorf("keyboard rows = %d, want 4", len(markup.InlineKeyboard))
	}
}

func TestBuildMoveNavigator_InSubfolder(t *testing.T) {
	note := model.Note{ID: 10}
	folders := []model.Folder{
		{ID: 3, Name: "Sub"},
	}
	topics := []model.Topic{
		{ID: 1, Name: "T1"},
	}
	folderChain := []model.Folder{
		{ID: 2, Name: "Parent"},
	}
	fldID := int64(2)
	text, markup := buildMoveNavigator(note, 1, &fldID, folders, folderChain, topics)
	if !strings.Contains(text, "Parent") {
		t.Errorf("text does not contain parent folder name: %q", text)
	}
	// insert + 1 folder + up + cancel = 4 rows
	if len(markup.InlineKeyboard) != 4 {
		t.Errorf("keyboard rows = %d, want 4", len(markup.InlineKeyboard))
	}
}

// --- replyKeyboard ---

func TestReplyKeyboard(t *testing.T) {
	kb := replyKeyboard()
	if len(kb.Keyboard) != 1 {
		t.Errorf("keyboard rows = %d, want 1", len(kb.Keyboard))
	}
	row := kb.Keyboard[0]
	if len(row) != 2 {
		t.Errorf("buttons in row = %d, want 2", len(row))
	}
}

// --- Схлопывание папок ---

func TestBuildCollapsedFoldersLabel(t *testing.T) {
	label := buildCollapsedFoldersLabel([]string{"Работа", "Личное"})
	if label != "[Работа, Личное] [🔽]" {
		t.Errorf("label = %q, want %q", label, "[Работа, Личное] [🔽]")
	}
	if len(label) > 64 {
		t.Errorf("label too long: %d bytes", len(label))
	}
}

func TestBuildCollapsedFoldersLabel_Truncated(t *testing.T) {
	names := []string{
		"ОченьДлинноеНазваниеПапкиОдин",
		"ЕщёОдноОченьДлинноеНазваниеПапкиДва",
		"ТретьеОченьДлинноеНазваниеПапкиТри",
	}
	label := buildCollapsedFoldersLabel(names)
	if len(label) > 64 {
		t.Errorf("label too long: %d bytes", len(label))
	}
	// Индикатор разворачивания сохраняется даже при обрезке имён
	if !strings.HasSuffix(label, "] [🔽]") {
		t.Errorf("label should end with '] [🔽]': %q", label)
	}
	if !strings.Contains(label, "…") {
		t.Errorf("truncated label should contain '…': %q", label)
	}
}

func TestTruncateBytes_Short(t *testing.T) {
	if got := truncateBytes("hello", 10); got != "hello" {
		t.Errorf("truncateBytes = %q, want %q", got, "hello")
	}
}

func TestTruncateBytes_UTF8Boundary(t *testing.T) {
	// Кириллица — 2 байта на символ; "абвгд" = 10 байт.
	// При лимите 9 байт помещаются 3 символа (6 байт) + «…» (3 байта).
	got := truncateBytes("абвгд", 9)
	if got != "абв…" {
		t.Errorf("truncateBytes = %q, want %q", got, "абв…")
	}
}

func TestBuildListMessage_CollapsedFolders(t *testing.T) {
	items := []listItem{
		{isCollapsed: true, levelKey: 0, folderNames: []string{"Работа", "Личное"}},
		{note: model.Note{ID: 1, Text: "Заметка"}},
	}
	_, markup := buildListMessage(items, 1, "Топик", nil, nil, 0, 1, false, false, false, 0, false)

	// свёрнутая папка + заметка = 2 строки
	if len(markup.InlineKeyboard) != 2 {
		t.Fatalf("keyboard rows = %d, want 2", len(markup.InlineKeyboard))
	}
	btn := markup.InlineKeyboard[0][0]
	if btn.Text != "[Работа, Личное] [🔽]" {
		t.Errorf("button text = %q, want %q", btn.Text, "[Работа, Личное] [🔽]")
	}
	if btn.CallbackData == nil || *btn.CallbackData != "expfolders:0" {
		t.Errorf("button callback = %v, want 'expfolders:0'", btn.CallbackData)
	}
}

func TestBuildListMessage_CollapsedFolders_InSubfolder(t *testing.T) {
	items := []listItem{
		{isCollapsed: true, levelKey: 42, folderNames: []string{"Подпапка1", "Подпапка2"}},
	}
	_, markup := buildListMessage(items, 1, "Топик", nil, nil, 0, 1, false, false, false, 0, false)

	btn := markup.InlineKeyboard[0][0]
	if btn.CallbackData == nil || *btn.CallbackData != "expfolders:42" {
		t.Errorf("button callback = %v, want 'expfolders:42'", btn.CallbackData)
	}
}

func TestFoldersCollapseState(t *testing.T) {
	expanded := map[int64]bool{5: true}
	tests := []struct {
		name        string
		enabled     bool
		folderCount int
		expanded    map[int64]bool
		levelKey    int64
		want        bool
	}{
		{"настройка выключена", false, 3, nil, 0, false},
		{"одна папка — не схлопываем", true, 1, nil, 0, false},
		{"две папки — схлопываем", true, 2, nil, 0, true},
		{"уровень развёрнут вручную", true, 3, expanded, 5, false},
		{"развёрнут другой уровень", true, 3, expanded, 6, true},
		{"карта развёрнутых nil", true, 3, nil, 5, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := foldersCollapseState(tt.enabled, tt.folderCount, tt.expanded, tt.levelKey)
			if got != tt.want {
				t.Errorf("foldersCollapseState = %v, want %v", got, tt.want)
			}
		})
	}
}

// --- buildSettingsMessage ---

func TestBuildSettingsMessage_IncludesFoldersCollapse(t *testing.T) {
	_, markup := buildSettingsMessage(false, false, false, false, 0, true, 4)

	found := false
	for _, row := range markup.InlineKeyboard {
		for _, btn := range row {
			if btn.CallbackData != nil && *btn.CallbackData == "togglesettings:folderscollapse" {
				found = true
				if !strings.Contains(btn.Text, "Схлопывать папки") {
					t.Errorf("toggle text = %q, want contains 'Схлопывать папки'", btn.Text)
				}
				if !strings.Contains(btn.Text, "Вкл") {
					t.Errorf("toggle text = %q, want 'Вкл' when enabled", btn.Text)
				}
			}
		}
	}
	if !found {
		t.Error("folderscollapse toggle not found in settings")
	}
}

func TestBuildSettingsMessage_QuickTopicsCount(t *testing.T) {
	_, markup := buildSettingsMessage(false, false, false, false, 0, false, 4)

	minus, plus, display := (*string)(nil), (*string)(nil), ""
	for _, row := range markup.InlineKeyboard {
		for _, btn := range row {
			if btn.CallbackData == nil {
				continue
			}
			switch *btn.CallbackData {
			case "togglesettings:quickminus":
				minus = btn.CallbackData
			case "togglesettings:quickplus":
				plus = btn.CallbackData
			case "none":
				if strings.Contains(btn.Text, "Быстрые топики") {
					display = btn.Text
				}
			}
		}
	}
	if minus == nil || plus == nil || display == "" {
		t.Fatal("quick topics buttons not found in settings")
	}
	if !strings.Contains(display, "Быстрые топики: 4") {
		t.Errorf("quick topics label = %q, want contains 'Быстрые топики: 4'", display)
	}
}

func TestBuildSettingsMessage_QuickTopicsZero(t *testing.T) {
	_, markup := buildSettingsMessage(false, false, false, false, 0, false, 0)

	found := false
	for _, row := range markup.InlineKeyboard {
		for _, btn := range row {
			if btn.CallbackData != nil && *btn.CallbackData == "none" && strings.Contains(btn.Text, "Быстрые топики: 0") {
				found = true
			}
		}
	}
	if !found {
		t.Error("quick topics label with 0 not found in settings")
	}
}

func TestBuildSettingsMessage_PickTopicsButton(t *testing.T) {
	// При включённых быстрых топиках — кнопка выбора топиков есть
	_, markup := buildSettingsMessage(false, false, false, false, 0, false, 4)

	found := false
	for _, row := range markup.InlineKeyboard {
		for _, btn := range row {
			if btn.CallbackData != nil && *btn.CallbackData == "quickpick" {
				found = true
			}
		}
	}
	if !found {
		t.Error("pick topics button (quickpick) not found in settings when quick topics enabled")
	}
}

func TestBuildSettingsMessage_PickTopicsButtonHiddenWhenDisabled(t *testing.T) {
	// При выключенных быстрых топиках (0) кнопки выбора быть не должно
	_, markup := buildSettingsMessage(false, false, false, false, 0, false, 0)

	for _, row := range markup.InlineKeyboard {
		for _, btn := range row {
			if btn.CallbackData != nil && *btn.CallbackData == "quickpick" {
				t.Error("pick topics button should be hidden when quick topics disabled")
			}
		}
	}
}

// --- buildTimersMessage ---

func TestBuildTimersMessage_Empty(t *testing.T) {
	text, markup := buildTimersMessage(nil, 0)
	if !strings.Contains(text, "⏰ Таймеры (0)") {
		t.Errorf("header = %q, want contains '⏰ Таймеры (0)'", text)
	}
	if !strings.Contains(text, "🔕 Таймеров нет") {
		t.Errorf("text = %q, want contains '🔕 Таймеров нет'", text)
	}
	if len(markup.InlineKeyboard) != 1 {
		t.Errorf("keyboard rows = %d, want 1", len(markup.InlineKeyboard))
	}
	back := markup.InlineKeyboard[0][0]
	if back.CallbackData == nil || *back.CallbackData != "backtolist" {
		t.Errorf("back button callback = %v, want 'backtolist'", back.CallbackData)
	}
}

func TestBuildTimersMessage_WithNotes(t *testing.T) {
	at := time.Date(2026, 8, 6, 15, 0, 0, 0, time.UTC) // 18:00 МСК при offset=0
	notes := []model.Note{
		{ID: 1, Text: "Разовый таймер", Priority: model.PriorityHigh, ReminderAt: &at, ReminderRepeat: model.ReminderRepeatOnce},
		{ID: 2, Text: "Ежедневный таймер", ReminderAt: &at, ReminderRepeat: model.ReminderRepeatDaily},
		{ID: 3, Text: "Выполненная", Done: true, ReminderAt: &at, ReminderRepeat: model.ReminderRepeatOnce},
	}

	text, markup := buildTimersMessage(notes, 0)
	if !strings.Contains(text, "⏰ Таймеры (3)") {
		t.Errorf("header = %q, want contains '⏰ Таймеры (3)'", text)
	}
	// 3 заметки + строка "Назад"
	if len(markup.InlineKeyboard) != 4 {
		t.Fatalf("keyboard rows = %d, want 4", len(markup.InlineKeyboard))
	}

	btn0 := markup.InlineKeyboard[0][0]
	if btn0.CallbackData == nil || *btn0.CallbackData != "view:1" {
		t.Errorf("button callback = %v, want 'view:1'", btn0.CallbackData)
	}
	if !strings.Contains(btn0.Text, "🔴") || !strings.Contains(btn0.Text, "⏰") {
		t.Errorf("button text = %q, want priority and timer emoji", btn0.Text)
	}
	if !strings.Contains(btn0.Text, "06.08.2026 18:00") {
		t.Errorf("button text = %q, want date '06.08.2026 18:00'", btn0.Text)
	}
	if !strings.Contains(btn0.Text, "🔂") {
		t.Errorf("button text = %q, want one-shot mode 🔂", btn0.Text)
	}
	if !strings.Contains(btn0.Text, "Разовый таймер") {
		t.Errorf("button text = %q, want preview", btn0.Text)
	}

	btn1 := markup.InlineKeyboard[1][0]
	if !strings.Contains(btn1.Text, "🔁") {
		t.Errorf("button text = %q, want daily mode 🔁", btn1.Text)
	}

	btn2 := markup.InlineKeyboard[2][0]
	if !strings.Contains(btn2.Text, "✅") {
		t.Errorf("button text = %q, want done mark ✅", btn2.Text)
	}

	back := markup.InlineKeyboard[3][0]
	if back.CallbackData == nil || *back.CallbackData != "backtolist" {
		t.Errorf("back button callback = %v, want 'backtolist'", back.CallbackData)
	}
}

func TestBuildTimersMessage_TimezoneOffset(t *testing.T) {
	at := time.Date(2026, 8, 6, 15, 0, 0, 0, time.UTC)
	notes := []model.Note{
		{ID: 1, Text: "Таймер", ReminderAt: &at, ReminderRepeat: model.ReminderRepeatOnce},
	}

	// offset=-3 (например, UTC): 15:00 UTC → 15:00
	_, markup := buildTimersMessage(notes, -3)
	if !strings.Contains(markup.InlineKeyboard[0][0].Text, "06.08.2026 15:00") {
		t.Errorf("button text = %q, want '06.08.2026 15:00' for offset -3", markup.InlineKeyboard[0][0].Text)
	}
}

// --- buildAttachmentsMessage ---

func TestBuildAttachmentsMessage_Empty(t *testing.T) {
	text, markup := buildAttachmentsMessage(nil, 42)
	if !strings.Contains(text, "Вложений нет") {
		t.Errorf("text = %q, want contains 'Вложений нет'", text)
	}
	if !strings.Contains(text, "#42") {
		t.Errorf("text = %q, want contains '#42'", text)
	}
	// Добавить + Назад = 2 строки
	if len(markup.InlineKeyboard) != 2 {
		t.Errorf("keyboard rows = %d, want 2", len(markup.InlineKeyboard))
	}
	addBtn := markup.InlineKeyboard[0][0]
	if addBtn.CallbackData == nil || *addBtn.CallbackData != "attadd:42" {
		t.Errorf("add button callback = %v, want 'attadd:42'", addBtn.CallbackData)
	}
}

func TestBuildAttachmentsMessage_WithAttachments(t *testing.T) {
	atts := []model.Attachment{
		{ID: 1, NoteID: 42, Type: model.AttachmentPhoto, FileName: "photo.jpg", FileSize: 2048},
		{ID: 2, NoteID: 42, Type: model.AttachmentDocument, FileName: "doc.pdf", FileSize: 5 * 1024 * 1024},
		{ID: 3, NoteID: 42, Type: model.AttachmentVoice, FileSize: 1024},
		{ID: 4, NoteID: 42, Type: model.AttachmentDocument, FileName: "отчет_final [v2].txt", FileSize: 512},
	}
	text, markup := buildAttachmentsMessage(atts, 42)

	if !strings.Contains(text, "Вложения *#42*") {
		t.Errorf("text = %q, want contains 'Вложения *#42*'", text)
	}
	if !strings.Contains(text, "🖼 photo.jpg · 2 КБ") {
		t.Errorf("text = %q, want contains photo line", text)
	}
	if !strings.Contains(text, "📄 doc.pdf · 5.0 МБ") {
		t.Errorf("text = %q, want contains document line", text)
	}
	if !strings.Contains(text, "🎙 файл · 1 КБ") {
		t.Errorf("text = %q, want contains voice line with fallback name", text)
	}
	// Имя со спецсимволами (_ [) должно быть экранировано для Markdown
	if !strings.Contains(text, "📄 отчет\\_final \\[v2].txt · 512 Б") {
		t.Errorf("text = %q, want escaped special chars in name", text)
	}

	// 4 вложения (кнопка + 🗑) + Добавить + Назад = 6 строк
	if len(markup.InlineKeyboard) != 6 {
		t.Fatalf("keyboard rows = %d, want 6", len(markup.InlineKeyboard))
	}
	getBtn := markup.InlineKeyboard[0][0]
	if getBtn.CallbackData == nil || *getBtn.CallbackData != "attget:1" {
		t.Errorf("get button callback = %v, want 'attget:1'", getBtn.CallbackData)
	}
	delBtn := markup.InlineKeyboard[0][1]
	if delBtn.CallbackData == nil || *delBtn.CallbackData != "attdel:1" {
		t.Errorf("delete button callback = %v, want 'attdel:1'", delBtn.CallbackData)
	}
	addRow := markup.InlineKeyboard[4][0]
	if addRow.CallbackData == nil || *addRow.CallbackData != "attadd:42" {
		t.Errorf("add button callback = %v, want 'attadd:42'", addRow.CallbackData)
	}
	backRow := markup.InlineKeyboard[5][0]
	if backRow.CallbackData == nil || *backRow.CallbackData != "view:42" {
		t.Errorf("back button callback = %v, want 'view:42'", backRow.CallbackData)
	}
}

// --- buildAttachmentDeleteConfirm ---

func TestBuildAttachmentDeleteConfirm(t *testing.T) {
	att := model.Attachment{ID: 7, NoteID: 42, Type: model.AttachmentPhoto, FileName: "photo.jpg"}
	text, markup := buildAttachmentDeleteConfirm(att)

	if !strings.Contains(text, "Удалить вложение") {
		t.Errorf("text = %q, want contains 'Удалить вложение'", text)
	}
	if !strings.Contains(text, "photo.jpg") {
		t.Errorf("text = %q, want contains file name", text)
	}
	if len(markup.InlineKeyboard) != 1 {
		t.Fatalf("keyboard rows = %d, want 1", len(markup.InlineKeyboard))
	}
	yesBtn := markup.InlineKeyboard[0][0]
	if yesBtn.CallbackData == nil || *yesBtn.CallbackData != "attconfdel:7" {
		t.Errorf("yes button callback = %v, want 'attconfdel:7'", yesBtn.CallbackData)
	}
	noBtn := markup.InlineKeyboard[0][1]
	if noBtn.CallbackData == nil || *noBtn.CallbackData != "attachments:42" {
		t.Errorf("no button callback = %v, want 'attachments:42'", noBtn.CallbackData)
	}
}

func TestBuildAttachmentDeleteConfirm_EscapesSpecialChars(t *testing.T) {
	att := model.Attachment{ID: 8, NoteID: 42, Type: model.AttachmentDocument, FileName: "фото_final *v2*.txt"}
	text, _ := buildAttachmentDeleteConfirm(att)

	// Спецсимволы _ и * должны быть экранированы для Markdown, чтобы edit не падал
	if !strings.Contains(text, "фото\\_final \\*v2\\*.txt") {
		t.Errorf("text = %q, want escaped special chars in file name", text)
	}
}

// Регрессия: имя с подчёркиваниями не должно быть обёрнуто в курсив _..._ —
// legacy Markdown игнорирует `\_` внутри курсива, и Telegram падает с
// "can't parse entities" (подтверждение удаления не появлялось).
func TestBuildAttachmentDeleteConfirm_UnderscoreName_NotWrappedInItalic(t *testing.T) {
	att := model.Attachment{ID: 9, NoteID: 42, Type: model.AttachmentDocument, FileName: "23_08_2026_Калининград—Псков.pdf"}
	text, _ := buildAttachmentDeleteConfirm(att)

	if strings.Contains(text, "_23\\_08") {
		t.Errorf("text = %q, want name NOT wrapped in italic (legacy Markdown ломается)", text)
	}
	if !strings.Contains(text, "23\\_08\\_2026") {
		t.Errorf("text = %q, want escaped underscores preserved", text)
	}
}
