package telegram

import (
	"strings"
	"testing"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"

	"todo-bot-tg/internal/model"
)

// --- entitiesToHTML ---

func TestEntitiesToHTML_NoEntities(t *testing.T) {
	got := entitiesToHTML("Просто текст <&>", nil)
	if got != "Просто текст &lt;&amp;&gt;" {
		t.Errorf("entitiesToHTML() = %q", got)
	}
}

func TestEntitiesToHTML_Bold(t *testing.T) {
	entities := []model.NoteEntity{{Type: "bold", Offset: 0, Length: 4}}
	got := entitiesToHTML("Вот *тут* жирно", entities)
	if got != "<b>Вот </b>*тут* жирно" {
		t.Errorf("entitiesToHTML() = %q, want %q", got, "<b>Вот </b>*тут* жирно")
	}
}

func TestEntitiesToHTML_Multiple(t *testing.T) {
	entities := []model.NoteEntity{
		{Type: "bold", Offset: 0, Length: 6},
		{Type: "italic", Offset: 9, Length: 6},
	}
	got := entitiesToHTML("Жирный и курсив", entities)
	want := "<b>Жирный</b> и <i>курсив</i>"
	if got != want {
		t.Errorf("entitiesToHTML() = %q, want %q", got, want)
	}
}

func TestEntitiesToHTML_EscapesSpecialChars(t *testing.T) {
	entities := []model.NoteEntity{{Type: "bold", Offset: 0, Length: 7}}
	got := entitiesToHTML("<b> и &", entities)
	if got != "<b>&lt;b&gt; и &amp;</b>" {
		t.Errorf("entitiesToHTML() = %q, want %q", got, "<b>&lt;b&gt; и &amp;</b>")
	}
}

func TestEntitiesToHTML_Nested(t *testing.T) {
	entities := []model.NoteEntity{
		{Type: "bold", Offset: 0, Length: 10},
		{Type: "italic", Offset: 3, Length: 4},
	}
	got := entitiesToHTML("0123456789", entities)
	if got != "<b>012<i>3456</i>789</b>" {
		t.Errorf("entitiesToHTML() = %q, want %q", got, "<b>012<i>3456</i>789</b>")
	}
}

func TestEntitiesToHTML_SameBounds(t *testing.T) {
	// Сущности с одинаковыми границами: закрытие в обратном порядке открытия
	entities := []model.NoteEntity{
		{Type: "bold", Offset: 0, Length: 5},
		{Type: "italic", Offset: 0, Length: 5},
	}
	got := entitiesToHTML("abcde", entities)
	if got != "<b><i>abcde</i></b>" {
		t.Errorf("entitiesToHTML() = %q, want %q", got, "<b><i>abcde</i></b>")
	}
}

func TestEntitiesToHTML_TextLink(t *testing.T) {
	entities := []model.NoteEntity{{Type: "text_link", Offset: 0, Length: 4, URL: "https://example.com?a=1&b=2"}}
	got := entitiesToHTML("Сайт", entities)
	want := `<a href="https://example.com?a=1&amp;b=2">Сайт</a>`
	if got != want {
		t.Errorf("entitiesToHTML() = %q, want %q", got, want)
	}
}

func TestEntitiesToHTML_Pre(t *testing.T) {
	entities := []model.NoteEntity{{Type: "pre", Offset: 0, Length: 6, Language: "go"}}
	got := entitiesToHTML("func x", entities)
	if got != `<pre><code class="language-go">func x</code></pre>` {
		t.Errorf("entitiesToHTML() = %q", got)
	}
}

func TestEntitiesToHTML_PreNoLanguage(t *testing.T) {
	entities := []model.NoteEntity{{Type: "pre", Offset: 0, Length: 3}}
	got := entitiesToHTML("abc", entities)
	if got != "<pre>abc</pre>" {
		t.Errorf("entitiesToHTML() = %q, want %q", got, "<pre>abc</pre>")
	}
}

func TestEntitiesToHTML_Spoiler(t *testing.T) {
	entities := []model.NoteEntity{{Type: "spoiler", Offset: 0, Length: 3}}
	got := entitiesToHTML("abc", entities)
	if got != "<tg-spoiler>abc</tg-spoiler>" {
		t.Errorf("entitiesToHTML() = %q, want %q", got, "<tg-spoiler>abc</tg-spoiler>")
	}
}

func TestEntitiesToHTML_CyrillicOffsets(t *testing.T) {
	// Telegram считает смещения в UTF-16: кириллица занимает 1 unit, но 2 байта.
	// «Привет» — 6 units, «мир» начинается с offset 7 (после пробела).
	entities := []model.NoteEntity{{Type: "bold", Offset: 7, Length: 3}}
	got := entitiesToHTML("Привет мир", entities)
	if got != "Привет <b>мир</b>" {
		t.Errorf("entitiesToHTML() = %q, want %q", got, "Привет <b>мир</b>")
	}
}

func TestEntitiesToHTML_EmojiOffsets(t *testing.T) {
	// Эмодзи 🚀 — вне BMP, в UTF-16 занимает 2 units (суррогатная пара).
	entities := []model.NoteEntity{{Type: "bold", Offset: 2, Length: 5}} // «текст»
	got := entitiesToHTML("🚀текст", entities)
	if got != "🚀<b>текст</b>" {
		t.Errorf("entitiesToHTML() = %q, want %q", got, "🚀<b>текст</b>")
	}
}

func TestEntitiesToHTML_OutOfBounds(t *testing.T) {
	entities := []model.NoteEntity{{Type: "bold", Offset: 100, Length: 5}}
	got := entitiesToHTML("abc", entities)
	if got != "abc" {
		t.Errorf("entitiesToHTML() = %q, want %q (битые сущности игнорируются)", got, "abc")
	}
}

// --- trimNoteText ---

func TestTrimNoteText_NoChange(t *testing.T) {
	entities := []model.NoteEntity{{Type: "bold", Offset: 0, Length: 3}}
	text, ents := trimNoteText("abc", entities)
	if text != "abc" || len(ents) != 1 {
		t.Errorf("trimNoteText() = (%q, %v), want unchanged", text, ents)
	}
}

func TestTrimNoteText_LeftSpaces(t *testing.T) {
	entities := []model.NoteEntity{{Type: "bold", Offset: 2, Length: 3}}
	text, ents := trimNoteText("  abc", entities)
	if text != "abc" {
		t.Fatalf("text = %q, want %q", text, "abc")
	}
	if len(ents) != 1 || ents[0].Offset != 0 || ents[0].Length != 3 {
		t.Errorf("entities = %+v, want offset=0 length=3", ents)
	}
}

func TestTrimNoteText_RightSpaces(t *testing.T) {
	entities := []model.NoteEntity{{Type: "bold", Offset: 0, Length: 5}}
	text, ents := trimNoteText("abc  ", entities)
	if text != "abc" {
		t.Fatalf("text = %q, want %q", text, "abc")
	}
	if len(ents) != 1 || ents[0].Offset != 0 || ents[0].Length != 3 {
		t.Errorf("entities = %+v, want offset=0 length=3", ents)
	}
}

func TestTrimNoteText_EntityCutByTrim(t *testing.T) {
	// Сущность, полностью состоящая из пробелов, после обрезки исчезает
	entities := []model.NoteEntity{{Type: "bold", Offset: 3, Length: 2}}
	text, ents := trimNoteText("abc  ", entities)
	if text != "abc" || len(ents) != 0 {
		t.Errorf("trimNoteText() = (%q, %v), want empty entities", text, ents)
	}
}

func TestTrimNoteText_Empty(t *testing.T) {
	entities := []model.NoteEntity{{Type: "bold", Offset: 0, Length: 3}}
	text, ents := trimNoteText("   ", entities)
	if text != "" || ents != nil {
		t.Errorf("trimNoteText() = (%q, %v), want empty", text, ents)
	}
}

// --- shiftNoteEntities ---

func TestShiftNoteEntities(t *testing.T) {
	entities := []model.NoteEntity{{Type: "bold", Offset: 5, Length: 3}}
	ents := shiftNoteEntities(entities, 3, 5)
	if len(ents) != 1 || ents[0].Offset != 2 || ents[0].Length != 3 {
		t.Errorf("shiftNoteEntities() = %+v, want offset=2 length=3", ents)
	}
}

func TestShiftNoteEntities_Clamp(t *testing.T) {
	entities := []model.NoteEntity{
		{Type: "bold", Offset: 0, Length: 2},   // выходит за новую границу слева
		{Type: "italic", Offset: 3, Length: 2}, // выходит за новую границу справа
	}
	ents := shiftNoteEntities(entities, 2, 3)
	if len(ents) != 1 || ents[0].Type != "italic" || ents[0].Offset != 1 || ents[0].Length != 2 {
		t.Errorf("shiftNoteEntities() = %+v, want только italic offset=1 length=2", ents)
	}
}

// --- extractNoteEntities ---

func TestExtractNoteEntities_FiltersAutoTypes(t *testing.T) {
	raw := []tgbotapi.MessageEntity{
		{Type: "bold", Offset: 0, Length: 3},
		{Type: "hashtag", Offset: 4, Length: 5},
		{Type: "url", Offset: 10, Length: 10},
		{Type: "italic", Offset: 21, Length: 2, URL: "https://x.ru"},
	}
	ents := extractNoteEntities(raw)
	if len(ents) != 2 {
		t.Fatalf("extractNoteEntities() = %d entities, want 2", len(ents))
	}
	if ents[0].Type != "bold" || ents[1].Type != "italic" || ents[1].URL != "https://x.ru" {
		t.Errorf("extractNoteEntities() = %+v", ents)
	}
}

// --- noteParseMode ---

func TestNoteParseMode(t *testing.T) {
	if got := noteParseMode(model.Note{Text: "plain"}); got != tgbotapi.ModeMarkdown {
		t.Errorf("noteParseMode(plain) = %q, want %q", got, tgbotapi.ModeMarkdown)
	}
	note := model.Note{Text: "x", Entities: []model.NoteEntity{{Type: "bold", Offset: 0, Length: 1}}}
	if got := noteParseMode(note); got != tgbotapi.ModeHTML {
		t.Errorf("noteParseMode(formatted) = %q, want %q", got, tgbotapi.ModeHTML)
	}
}

// --- reviveNoteEntities ---

func TestReviveNoteEntities_TextUnchanged(t *testing.T) {
	entities := []model.NoteEntity{{Type: "bold", Offset: 0, Length: 4}}
	got := reviveNoteEntities("abcd", "abcd", entities)
	if len(got) != 1 || got[0].Offset != 0 {
		t.Errorf("reviveNoteEntities() = %+v, want offset=0", got)
	}
}

func TestReviveNoteEntities_AppendAtEnd(t *testing.T) {
	entities := []model.NoteEntity{{Type: "bold", Offset: 0, Length: 4}}
	got := reviveNoteEntities("abcd", "abcd XYZ", entities)
	if len(got) != 1 || got[0].Offset != 0 || got[0].Length != 4 {
		t.Errorf("reviveNoteEntities() = %+v, want offset=0 length=4", got)
	}
}

func TestReviveNoteEntities_PrependAtStart(t *testing.T) {
	entities := []model.NoteEntity{{Type: "bold", Offset: 0, Length: 4}}
	got := reviveNoteEntities("abcd", "XYZ abcd", entities)
	if len(got) != 1 || got[0].Offset != 4 {
		t.Errorf("reviveNoteEntities() = %+v, want offset=4", got)
	}
}

func TestReviveNoteEntities_InsertInMiddle(t *testing.T) {
	// Вставка в середину: сущности из префиксной части не сдвигаются,
	// из суффиксной — сдвигаются на разницу длин.
	entities := []model.NoteEntity{
		{Type: "bold", Offset: 0, Length: 3},   // "abc" — остаётся на месте
		{Type: "italic", Offset: 3, Length: 3}, // "def" — сдвигается на 1
	}
	got := reviveNoteEntities("abcdef", "abcXdef", entities)
	if len(got) != 2 {
		t.Fatalf("reviveNoteEntities() = %+v, want 2 entities", got)
	}
	if got[0].Offset != 0 || got[1].Offset != 4 || got[1].Length != 3 {
		t.Errorf("reviveNoteEntities() = %+v, want bold(0,3) italic(4,3)", got)
	}
}

func TestReviveNoteEntities_EditInMiddle(t *testing.T) {
	// Правка в середине жирного фрагмента: сущность пересекает изменённую
	// область и отбрасывается; сущность в неизменённой зоне сохраняется.
	entities := []model.NoteEntity{
		{Type: "bold", Offset: 0, Length: 4},   // "abcd" — пересекает правку
		{Type: "italic", Offset: 5, Length: 3}, // "fgh" — в неизменённой зоне
	}
	got := reviveNoteEntities("abcde fgh", "abcXe fgh", entities)
	if len(got) != 1 || got[0].Type != "italic" || got[0].Offset != 5 {
		t.Errorf("reviveNoteEntities() = %+v, want только italic offset=5", got)
	}
}

func TestReviveNoteEntities_Cyrillic(t *testing.T) {
	entities := []model.NoteEntity{{Type: "bold", Offset: 0, Length: 6}} // «Жирный»
	got := reviveNoteEntities("Жирный текст", "Жирный текст здесь", entities)
	if len(got) != 1 || got[0].Offset != 0 || got[0].Length != 6 {
		t.Errorf("reviveNoteEntities() = %+v, want offset=0 length=6", got)
	}
}

func TestReviveNoteEntities_NoEntities(t *testing.T) {
	if got := reviveNoteEntities("old", "old new", nil); got != nil {
		t.Errorf("reviveNoteEntities() = %+v, want nil", got)
	}
}

// --- commandArgOffset ---

func TestCommandArgOffset(t *testing.T) {
	msg := &tgbotapi.Message{
		Text: "/add Сходить в магазин",
		Entities: []tgbotapi.MessageEntity{
			{Type: "bot_command", Offset: 0, Length: 4},
		},
	}
	if got := commandArgOffset(msg); got != 5 {
		t.Errorf("commandArgOffset() = %d, want 5", got)
	}

	msg2 := &tgbotapi.Message{
		Text: "/add",
		Entities: []tgbotapi.MessageEntity{
			{Type: "bot_command", Offset: 0, Length: 4},
		},
	}
	if got := commandArgOffset(msg2); got != 4 {
		t.Errorf("commandArgOffset(/add) = %d, want 4", got)
	}

	msg3 := &tgbotapi.Message{
		Text: "/add@MyBot текст",
		Entities: []tgbotapi.MessageEntity{
			{Type: "bot_command", Offset: 0, Length: 10},
		},
	}
	if got := commandArgOffset(msg3); got != 11 {
		t.Errorf("commandArgOffset(/add@MyBot) = %d, want 11", got)
	}
}

func TestBuildViewNoteMessage_WithEntities_HTML(t *testing.T) {
	note := model.Note{
		ID:   1,
		Text: "Жирный и курсив",
		Entities: []model.NoteEntity{
			{Type: "bold", Offset: 0, Length: 6},
			{Type: "italic", Offset: 9, Length: 6},
		},
	}
	text, _ := buildViewNoteMessage(note, false, 0)
	if !strings.Contains(text, "<b>Жирный</b> и <i>курсив</i>") {
		t.Errorf("text = %q, want HTML formatting", text)
	}
	if !strings.Contains(text, "<b>#1</b>") {
		t.Errorf("text = %q, want HTML note ID", text)
	}
}

func TestBuildViewNoteMessage_WithEntities_Done(t *testing.T) {
	note := model.Note{
		ID:       1,
		Text:     "Заметка",
		Entities: []model.NoteEntity{{Type: "bold", Offset: 0, Length: 7}},
		Done:     true,
	}
	text, _ := buildViewNoteMessage(note, false, 0)
	if !strings.Contains(text, "<s><b>Заметка</b></s>") {
		t.Errorf("text = %q, want strikethrough wrapper", text)
	}
}
