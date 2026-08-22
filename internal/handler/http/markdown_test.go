package http

import (
	"testing"

	"github.com/stretchr/testify/require"

	"todo-bot-tg/internal/model"
)

func TestParseMarkdown_Bold(t *testing.T) {
	text, entities := parseMarkdownEntities("Купить **молоко**")
	require.Equal(t, "Купить молоко", text)
	require.Equal(t, []model.NoteEntity{{Type: "bold", Offset: 7, Length: 6}}, entities)
}

func TestParseMarkdown_ItalicAndCode(t *testing.T) {
	text, entities := parseMarkdownEntities("Купить *молоко* и `хлеб`")
	require.Equal(t, "Купить молоко и хлеб", text)
	require.Equal(t, []model.NoteEntity{
		{Type: "italic", Offset: 7, Length: 6},
		{Type: "code", Offset: 16, Length: 4},
	}, entities)
}

func TestParseMarkdown_Link(t *testing.T) {
	text, entities := parseMarkdownEntities("Сайт [пример](https://example.com)")
	require.Equal(t, "Сайт пример", text)
	require.Equal(t, []model.NoteEntity{{
		Type: "text_link", Offset: 5, Length: 6, URL: "https://example.com",
	}}, entities)
}

func TestParseMarkdown_Mixed(t *testing.T) {
	text, entities := parseMarkdownEntities("**Важно**: позвонить *Маше* и `написать` [отчёт](https://x.io)")
	require.Equal(t, "Важно: позвонить Маше и написать отчёт", text)
	require.Equal(t, []model.NoteEntity{
		{Type: "bold", Offset: 0, Length: 5},
		{Type: "italic", Offset: 17, Length: 4},
		{Type: "code", Offset: 24, Length: 8},
		{Type: "text_link", Offset: 33, Length: 5, URL: "https://x.io"},
	}, entities)
}

func TestParseMarkdown_NoFormatting(t *testing.T) {
	text, entities := parseMarkdownEntities("Обычный текст без разметки")
	require.Equal(t, "Обычный текст без разметки", text)
	require.Empty(t, entities)
}

func TestParseMarkdown_UnclosedMarkerIsLiteral(t *testing.T) {
	// Незакрытый маркер остаётся как есть.
	text, entities := parseMarkdownEntities("Купить *молоко")
	require.Equal(t, "Купить *молоко", text)
	require.Empty(t, entities)
}

func TestParseMarkdown_UTF16Offsets(t *testing.T) {
	// Эмодзи занимает 2 UTF-16 единицы — offset после него смещается.
	text, entities := parseMarkdownEntities("🛒 **молоко**")
	require.Equal(t, "🛒 молоко", text)
	require.Equal(t, []model.NoteEntity{{Type: "bold", Offset: 3, Length: 6}}, entities)
}
