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

	text, markup := buildCalendar(1, 2026, 8, 0)
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
	text, markup := buildHourPicker(1, 2026, 8, 6, 0)
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
	text, markup := buildMinuteRangePicker(1, 2026, 8, 6, 15, 0)
	if !strings.Contains(text, "Выбери минуты") {
		t.Errorf("text does not contain prompt: %q", text)
	}
	// 1 range row + 1 back row
	if len(markup.InlineKeyboard) != 2 {
		t.Errorf("keyboard rows = %d, want 2", len(markup.InlineKeyboard))
	}
}

func TestBuildMinuteExactPicker(t *testing.T) {
	text, markup := buildMinuteExactPicker(1, 2026, 8, 6, 15, 0, 0)
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
