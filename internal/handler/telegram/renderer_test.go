package telegram

import (
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
		priority int
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

// --- buildViewNoteMessage ---

func TestBuildViewNoteMessage(t *testing.T) {
	note := model.Note{ID: 1, Text: "Test note", Priority: model.PriorityHigh}
	text, markup := buildViewNoteMessage(note)
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
	text, _ := buildViewNoteMessage(note)
	if !strings.Contains(text, "⏰") {
		t.Errorf("text does not contain reminder emoji: %q", text)
	}
}

// --- buildReminderMenu ---

func TestBuildReminderMenu(t *testing.T) {
	note := model.Note{ID: 5}
	text, markup := buildReminderMenu(note)
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
	// 3 rows: "Все", topic1, topic2
	if len(markup.InlineKeyboard) != 3 {
		t.Errorf("keyboard rows = %d, want 3", len(markup.InlineKeyboard))
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
	text, markup := buildListMessage(nil, 0, "", nil, nil, 0, 1, true, false)
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
	text, markup := buildListMessage(items, 0, "", nil, nil, 0, 2, true, false)
	if !strings.Contains(text, "Все заметки") {
		t.Errorf("text does not contain header: %q", text)
	}
	// 10 note buttons + 1 "🔝 Топики" row + 1 pagination row = 12
	if len(markup.InlineKeyboard) != 12 {
		t.Errorf("keyboard rows = %d, want 12", len(markup.InlineKeyboard))
	}
}

// --- buildCalendar ---

func TestBuildCalendar(t *testing.T) {
	now = func() time.Time { return time.Date(2026, 8, 6, 12, 0, 0, 0, time.UTC) }
	defer func() { now = time.Now }()

	text, markup := buildCalendar(1, 2026, 8)
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
	text, markup := buildHourPicker(1, 2026, 8, 6)
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
	text, markup := buildMinuteRangePicker(1, 2026, 8, 6, 15)
	if !strings.Contains(text, "Выбери минуты") {
		t.Errorf("text does not contain prompt: %q", text)
	}
	// 1 range row + 1 back row
	if len(markup.InlineKeyboard) != 2 {
		t.Errorf("keyboard rows = %d, want 2", len(markup.InlineKeyboard))
	}
}

func TestBuildMinuteExactPicker(t *testing.T) {
	text, markup := buildMinuteExactPicker(1, 2026, 8, 6, 15, 0)
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
