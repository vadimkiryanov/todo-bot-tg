package http

import (
	"unicode/utf16"

	"todo-bot-tg/internal/model"
)

// parseMarkdownEntities разбирает markdown-подобную разметку в чистый текст
// и entities форматирования (формат NoteEntity/Telegram). Поддерживает:
//
//	**bold**, *italic*, `code`, [text](url)
//
// Маркеры удаляются из текста; offset/length считаются в UTF-16 единицах
// (как у Telegram), поэтому результат можно отдавать боту напрямую.
// Вложенность не поддерживается: маркеры в маркерах остаются литералами.
func parseMarkdownEntities(text string) (string, []model.NoteEntity) {
	runes := []rune(text)
	var out []rune
	var entities []model.NoteEntity
	i, pos := 0, 0

	for i < len(runes) {
		// **bold**
		if i+1 < len(runes) && runes[i] == '*' && runes[i+1] == '*' {
			if content, next, ok := findClosing(runes, i+2, "**"); ok {
				addEntity(&entities, &out, &pos, content, "bold", "")
				i = next
				continue
			}
		}
		// *italic* (не часть **)
		if runes[i] == '*' {
			if content, next, ok := findClosing(runes, i+1, "*"); ok {
				addEntity(&entities, &out, &pos, content, "italic", "")
				i = next
				continue
			}
		}
		// `code`
		if runes[i] == '`' {
			if content, next, ok := findClosing(runes, i+1, "`"); ok {
				addEntity(&entities, &out, &pos, content, "code", "")
				i = next
				continue
			}
		}
		// [text](url)
		if runes[i] == '[' {
			if content, next, ok, url := findLink(runes, i); ok {
				addEntity(&entities, &out, &pos, content, "text_link", url)
				i = next
				continue
			}
		}
		out = append(out, runes[i])
		pos += utf16.RuneLen(runes[i])
		i++
	}
	return string(out), entities
}

// findClosing ищет закрывающий маркер close начиная с индекса from.
// Возвращает содержимое между маркерами, индекс за закрывающим маркером и признак успеха.
func findClosing(runes []rune, from int, close string) (content []rune, next int, ok bool) {
	closeRunes := []rune(close)
	for j := from; j+len(closeRunes) <= len(runes); j++ {
		if runesEqual(runes[j:j+len(closeRunes)], closeRunes) {
			return runes[from:j], j + len(closeRunes), true
		}
	}
	return nil, 0, false
}

// findLink разбирает [text](url) начиная с '[' на индексе i.
func findLink(runes []rune, i int) (content []rune, next int, ok bool, url string) {
	closeRunes := []rune("](")
	for j := i + 1; j+2 <= len(runes); j++ {
		if runesEqual(runes[j:j+2], closeRunes) {
			content = runes[i+1 : j]
			urlStart := j + 2
			for k := urlStart; k < len(runes); k++ {
				if runes[k] == ')' {
					url = string(runes[urlStart:k])
					if url != "" {
						return content, k + 1, true, url
					}
					return nil, 0, false, ""
				}
			}
			return nil, 0, false, ""
		}
	}
	return nil, 0, false, ""
}

func addEntity(entities *[]model.NoteEntity, out *[]rune, pos *int, content []rune, typ, url string) {
	length := 0
	for _, r := range content {
		length += utf16.RuneLen(r)
	}
	*entities = append(*entities, model.NoteEntity{Type: typ, Offset: *pos, Length: length, URL: url})
	*out = append(*out, content...)
	*pos += length
}

func runesEqual(a, b []rune) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
