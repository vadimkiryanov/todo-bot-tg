package telegram

import (
	"html"
	"sort"
	"strings"
	"unicode/utf8"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"

	"todo-bot-tg/internal/model"
)

// formattingEntityTypes — типы сущностей, которые сохраняются как ручное
// форматирование заметки. Автоматические (mention, hashtag, url, bot_command
// и т.п.) не сохраняются: Telegram воспроизводит их из текста сам, а при
// HTML-рендере они превратились бы в обычный текст со спецсимволами.
var formattingEntityTypes = map[string]bool{
	"bold":          true,
	"italic":        true,
	"underline":     true,
	"strikethrough": true,
	"spoiler":       true,
	"code":          true,
	"pre":           true,
	"text_link":     true,
}

// extractNoteEntities извлекает из сущностей сообщения Telegram только те,
// что описывают ручное форматирование (offset/length остаются в UTF-16
// единицах, как их отдаёт Telegram).
func extractNoteEntities(entities []tgbotapi.MessageEntity) []model.NoteEntity {
	var out []model.NoteEntity
	for _, e := range entities {
		if !formattingEntityTypes[e.Type] {
			continue
		}
		out = append(out, model.NoteEntity{
			Type:     e.Type,
			Offset:   e.Offset,
			Length:   e.Length,
			URL:      e.URL,
			Language: e.Language,
		})
	}
	return out
}

// trimNoteText обрезает пробельные символы по краям текста и корректирует
// смещения сущностей форматирования, чтобы они остались валидными для
// обрезанного текста (в UTF-16 единицах).
func trimNoteText(text string, entities []model.NoteEntity) (string, []model.NoteEntity) {
	trimmed := strings.TrimSpace(text)
	left := strings.TrimLeft(text, " \t\r\n")
	cut := utf16Len(text[:len(text)-len(left)]) // обрезано слева, в UTF-16
	if cut == 0 && len(trimmed) == len(text) {
		return text, entities
	}
	if trimmed == "" {
		return "", nil
	}

	trimmedLen := utf16Len(trimmed)
	out := make([]model.NoteEntity, 0, len(entities))
	for _, e := range entities {
		start := e.Offset - cut
		end := e.Offset + e.Length - cut
		if start < 0 {
			start = 0
		}
		if end > trimmedLen {
			end = trimmedLen
		}
		if end <= start {
			continue
		}
		e.Offset = start
		e.Length = end - start
		out = append(out, e)
	}
	return trimmed, out
}

// shiftNoteEntities сдвигает сущности на начало подстроки текста (offset
// задан в UTF-16 единицах) и обрезает по длине нового текста (newLen).
func shiftNoteEntities(entities []model.NoteEntity, offset, newLen int) []model.NoteEntity {
	out := make([]model.NoteEntity, 0, len(entities))
	for _, e := range entities {
		start := e.Offset - offset
		end := e.Offset + e.Length - offset
		if start < 0 {
			start = 0
		}
		if end > newLen {
			end = newLen
		}
		if end <= start {
			continue
		}
		e.Offset = start
		e.Length = end - start
		out = append(out, e)
	}
	return out
}

// reviveNoteEntities переносит форматирование со старого текста на новый,
// когда сущности не пришли в сообщении: кнопка ✏️ (switch_inline_query)
// подставляет в поле ввода plain-текст — Telegram не передаёт entities.
//
// Стратегия: если новый текст — это старый с добавлением/удалением по краям
// (общий префикс и суффикс сохраняются), все сущности переносятся со сдвигом
// на разницу длин. При правках в середине переносятся только сущности,
// целиком лежащие в неизменённой области; остальные отбрасываются.
func reviveNoteEntities(oldText, newText string, oldEntities []model.NoteEntity) []model.NoteEntity {
	if len(oldEntities) == 0 || oldText == newText {
		return oldEntities
	}

	oldLen := utf16Len(oldText)
	newLen := utf16Len(newText)

	// Общий префикс и суффикс в UTF-16 единицах
	prefix := 0
	for prefix < oldLen && prefix < newLen && utf16At(oldText, prefix) == utf16At(newText, prefix) {
		prefix++
	}
	suffix := 0
	for suffix < oldLen-prefix && suffix < newLen-prefix &&
		utf16At(oldText, oldLen-1-suffix) == utf16At(newText, newLen-1-suffix) {
		suffix++
	}

	delta := newLen - oldLen
	out := make([]model.NoteEntity, 0, len(oldEntities))
	if prefix+suffix >= oldLen {
		// Старый текст целиком сохранён в новом (вставка/удаление по краям):
		// сущности из префиксной части не сдвигаются, из суффиксной —
		// сдвигаются на разницу длин.
		for _, e := range oldEntities {
			if e.Offset >= oldLen-suffix {
				e.Offset += delta
			}
			out = append(out, e)
		}
		return out
	}

	for _, e := range oldEntities {
		switch {
		case e.Offset+e.Length <= prefix:
			// префиксная зона — позиция не меняется
		case e.Offset >= oldLen-suffix, e.Offset >= prefix && e.Offset+e.Length <= oldLen-suffix:
			// суффиксная и средняя зоны — сдвиг на разницу длин
			e.Offset += delta
		default:
			continue // сущность пересекает изменённую область
		}
		out = append(out, e)
	}
	return out
}

// utf16At возвращает rune на позиции pos (в UTF-16 единицах) строки s
// или -1, если позиция выходит за пределы строки.
func utf16At(s string, pos int) rune {
	n := 0
	for _, r := range s {
		if n == pos {
			return r
		}
		if r > 0xFFFF {
			n += 2
		} else {
			n++
		}
	}
	return -1
}

// commandArgOffset возвращает позицию начала аргументов команды в полном
// тексте сообщения (в UTF-16 единицах) или -1, если текст не соответствует
// команде. Позиция считается после "/cmd" (или "/cmd@username") и пробела.
func commandArgOffset(msg *tgbotapi.Message) int {
	prefix := "/" + msg.CommandWithAt()
	if !strings.HasPrefix(msg.Text, prefix) {
		return -1
	}
	off := utf16Len(prefix)
	if off < utf16Len(msg.Text) {
		off++ // пробел после команды
	}
	return off
}

// utf16Len возвращает длину строки в UTF-16 code units (как считает Telegram
// смещения сущностей: символы вне BMP занимают 2 единицы).
func utf16Len(s string) int {
	n := 0
	for _, r := range s {
		if r > 0xFFFF {
			n += 2
		} else {
			n++
		}
	}
	return n
}

// utf16ToByte конвертирует позицию в UTF-16 code units в позицию в байтах
// (для нарезки Go-строки).
func utf16ToByte(s string, pos int) int {
	bytePos := 0
	for _, r := range s {
		if pos <= 0 {
			break
		}
		if r > 0xFFFF {
			pos -= 2
		} else {
			pos--
		}
		bytePos += utf8.RuneLen(r)
	}
	return bytePos
}

// entitiesToHTML преобразует текст с сущностями форматирования в HTML-разметку
// для отправки с ParseMode=HTML. Спецсимволы текста экранируются, теги
// расставляются по границам сущностей. Telegram не допускает пересечения
// сущностей — только вложенность, поэтому события сортируются по позициям
// (закрытия внутренних сущностей идут раньше внешних).
func entitiesToHTML(text string, entities []model.NoteEntity) string {
	if len(entities) == 0 {
		return html.EscapeString(text)
	}

	textLen := utf16Len(text)
	type event struct {
		pos  int // позиция в UTF-16 единицах
		idx  int // индекс сущности в исходном списке
		open bool
	}
	events := make([]event, 0, len(entities)*2)
	for i, e := range entities {
		if e.Type == "" || e.Offset < 0 || e.Length <= 0 || e.Offset+e.Length > textLen {
			continue // битые сущности игнорируем
		}
		events = append(events,
			event{pos: e.Offset, idx: i, open: true},
			event{pos: e.Offset + e.Length, idx: i, open: false},
		)
	}
	if len(events) == 0 {
		return html.EscapeString(text)
	}

	sort.SliceStable(events, func(i, j int) bool {
		if events[i].pos != events[j].pos {
			return events[i].pos < events[j].pos
		}
		if events[i].open != events[j].open {
			return events[i].open // открытия — раньше закрытий
		}
		if !events[i].open {
			return events[i].idx > events[j].idx // закрытия — в обратном порядке открытия
		}
		return events[i].idx < events[j].idx
	})

	var b strings.Builder
	bytePos := 0
	for _, ev := range events {
		p := utf16ToByte(text, ev.pos)
		if p < bytePos {
			continue // сущность внутри уже закрытой области — пропускаем
		}
		b.WriteString(html.EscapeString(text[bytePos:p]))
		if ev.open {
			b.WriteString(entityOpenTag(entities[ev.idx]))
		} else {
			b.WriteString(entityCloseTag(entities[ev.idx]))
		}
		bytePos = p
	}
	b.WriteString(html.EscapeString(text[bytePos:]))
	return b.String()
}

// entityOpenTag возвращает открывающий HTML-тег для сущности (или "", если
// тип не поддерживается).
func entityOpenTag(e model.NoteEntity) string {
	switch e.Type {
	case "bold":
		return "<b>"
	case "italic":
		return "<i>"
	case "underline":
		return "<u>"
	case "strikethrough":
		return "<s>"
	case "spoiler":
		return "<tg-spoiler>"
	case "code":
		return "<code>"
	case "pre":
		if e.Language != "" {
			return `<pre><code class="language-` + html.EscapeString(e.Language) + `">`
		}
		return "<pre>"
	case "text_link":
		return `<a href="` + html.EscapeString(e.URL) + `">`
	}
	return ""
}

// entityCloseTag возвращает закрывающий HTML-тег для сущности.
func entityCloseTag(e model.NoteEntity) string {
	switch e.Type {
	case "bold":
		return "</b>"
	case "italic":
		return "</i>"
	case "underline":
		return "</u>"
	case "strikethrough":
		return "</s>"
	case "spoiler":
		return "</tg-spoiler>"
	case "code":
		return "</code>"
	case "pre":
		if e.Language != "" {
			return "</code></pre>"
		}
		return "</pre>"
	case "text_link":
		return "</a>"
	}
	return ""
}

// noteParseMode возвращает ParseMode для сообщения просмотра заметки:
// HTML, если у заметки есть форматирование, иначе legacy Markdown
// (обратная совместимость с существующими заметками без форматирования).
func noteParseMode(note model.Note) string {
	if len(note.Entities) > 0 {
		return tgbotapi.ModeHTML
	}
	return tgbotapi.ModeMarkdown
}
