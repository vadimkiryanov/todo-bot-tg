package telegram

import (
	"fmt"
	"io"
	"log"
	"net/http"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"

	"todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/model"
)

// maxFileSize — лимит скачивания файлов ботом (Telegram: 20 МБ).
const maxFileSize = 20 * 1024 * 1024

// mediaInfo — извлечённые из сообщения данные медиа.
type mediaInfo struct {
	Type     model.AttachmentType
	FileID   string
	FileName string
	MimeType string
	FileSize int64
}

// extractMedia извлекает медиа из сообщения Telegram.
// Поддерживаются все типы: фото, документ, аудио, видео, голосовое,
// видеосообщение, анимация (GIF) и стикер.
func extractMedia(msg *tgbotapi.Message) (mediaInfo, bool) {
	switch {
	case len(msg.Photo) > 0:
		// Берём самый большой размер фото
		p := msg.Photo[len(msg.Photo)-1]
		return mediaInfo{Type: model.AttachmentPhoto, FileID: p.FileID, FileName: "photo.jpg", MimeType: "image/jpeg", FileSize: int64(p.FileSize)}, true
	case msg.Document != nil:
		return mediaInfo{Type: model.AttachmentDocument, FileID: msg.Document.FileID, FileName: msg.Document.FileName, MimeType: msg.Document.MimeType, FileSize: int64(msg.Document.FileSize)}, true
	case msg.Audio != nil:
		return mediaInfo{Type: model.AttachmentAudio, FileID: msg.Audio.FileID, FileName: msg.Audio.FileName, MimeType: msg.Audio.MimeType, FileSize: int64(msg.Audio.FileSize)}, true
	case msg.Video != nil:
		return mediaInfo{Type: model.AttachmentVideo, FileID: msg.Video.FileID, FileName: "video.mp4", MimeType: msg.Video.MimeType, FileSize: int64(msg.Video.FileSize)}, true
	case msg.Voice != nil:
		return mediaInfo{Type: model.AttachmentVoice, FileID: msg.Voice.FileID, FileName: "voice.ogg", MimeType: msg.Voice.MimeType, FileSize: int64(msg.Voice.FileSize)}, true
	case msg.VideoNote != nil:
		return mediaInfo{Type: model.AttachmentVideoNote, FileID: msg.VideoNote.FileID, FileName: "video_note.mp4", MimeType: "video/mp4", FileSize: int64(msg.VideoNote.FileSize)}, true
	case msg.Animation != nil:
		return mediaInfo{Type: model.AttachmentAnimation, FileID: msg.Animation.FileID, FileName: "animation.gif", MimeType: msg.Animation.MimeType, FileSize: int64(msg.Animation.FileSize)}, true
	case msg.Sticker != nil:
		return mediaInfo{Type: model.AttachmentSticker, FileID: msg.Sticker.FileID, FileName: "sticker.webp", MimeType: "image/webp", FileSize: int64(msg.Sticker.FileSize)}, true
	}
	return mediaInfo{}, false
}

// handleAttachmentMessage обрабатывает медиа-сообщение: скачивает файл
// и прикрепляет его к заметке.
//
// Два режима:
//   - режим StateWaitingAttachment: прикрепляем к AttachmentNoteID (через 📎),
//     после — возврат к списку (refreshList);
//   - простое прикрепление: файл прикрепляется к последней просмотренной
//     заметке (LastViewedNoteID), экран просмотра при этом не перетирается.
func (h *Handler) handleAttachmentMessage(msg *tgbotapi.Message, userID int64, att mediaInfo) {
	s := h.states.Get(userID)
	attachMode := s.State == StateWaitingAttachment && s.AttachmentNoteID != 0

	noteID := s.AttachmentNoteID
	if !attachMode {
		// Простое прикрепление — к последней просмотренной заметке
		noteID = s.LastViewedNoteID
		if noteID == 0 {
			h.deleteUserMsg(msg)
			h.send(msg.Chat.ID, "❌ Сначала открой заметку, а затем отправь файл — он прикрепится к ней.")
			return
		}
	}

	h.deleteUserMsg(msg)
	if attachMode {
		h.clearPrompt(msg.Chat.ID, userID)
	}
	h.states.Reset(userID)

	data, err := h.downloadFile(att.FileID)
	if err != nil {
		h.send(msg.Chat.ID, fmt.Sprintf("❌ %v", err))
		return
	}

	_, err = h.attachmentService.AddAttachment(userID, noteID, att.Type, att.FileID, att.FileName, att.MimeType, att.FileSize, data)
	if err != nil {
		h.send(msg.Chat.ID, fmt.Sprintf("❌ %v", err))
		return
	}

	if attachMode {
		h.sendTimed(msg.Chat.ID, "✅ Файл прикреплён.")
		// Остаёмся в списке вложений заметки, а не уходим в список заметок
		h.showAttachmentList(msg.Chat.ID, s.AttachmentListMsgID, userID, noteID)
		return
	}

	h.sendTimed(msg.Chat.ID, fmt.Sprintf("✅ Файл прикреплён к заметке #%d.", noteID))
	// Если открыт список вложений этой же заметки — перерисовываем его,
	// чтобы новый файл сразу появился в списке
	if s.AttachmentListMsgID != 0 && s.AttachmentListNoteID == noteID {
		h.showAttachmentList(msg.Chat.ID, s.AttachmentListMsgID, userID, noteID)
	}
}

// downloadFile скачивает файл из Telegram по file_id (лимит 20 МБ).
func (h *Handler) downloadFile(fileID string) ([]byte, error) {
	f, err := h.api.GetFile(tgbotapi.FileConfig{FileID: fileID})
	if err != nil {
		return nil, fmt.Errorf("получение информации о файле: %w", err)
	}
	if f.FileSize > maxFileSize {
		return nil, errors.ErrFileTooLarge
	}

	url := f.Link(h.api.Token)
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("скачивание файла: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ошибка скачивания: HTTP %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("чтение файла: %w", err)
	}
	if len(data) > maxFileSize {
		return nil, errors.ErrFileTooLarge
	}
	return data, nil
}

// attachmentCloseMarkup — кнопка «❌ Закрыть» под медиа-сообщением просмотра.
func attachmentCloseMarkup() *tgbotapi.InlineKeyboardMarkup {
	closeBtn := tgbotapi.NewInlineKeyboardButtonData("❌ Закрыть", "closeatt")
	markup := tgbotapi.NewInlineKeyboardMarkup(tgbotapi.NewInlineKeyboardRow(closeBtn))
	return &markup
}

// attachmentSend строит сообщение с медиа вложения и кнопкой «❌ Закрыть».
func (h *Handler) attachmentSend(chatID int64, att model.Attachment) tgbotapi.Chattable {
	markup := attachmentCloseMarkup()

	switch att.Type {
	case model.AttachmentPhoto:
		m := tgbotapi.NewPhoto(chatID, tgbotapi.FileID(att.FileID))
		m.ReplyMarkup = markup
		return m
	case model.AttachmentSticker:
		m := tgbotapi.NewSticker(chatID, tgbotapi.FileID(att.FileID))
		m.ReplyMarkup = markup
		return m
	case model.AttachmentAudio:
		m := tgbotapi.NewAudio(chatID, tgbotapi.FileID(att.FileID))
		m.ReplyMarkup = markup
		return m
	case model.AttachmentVoice:
		m := tgbotapi.NewVoice(chatID, tgbotapi.FileID(att.FileID))
		m.ReplyMarkup = markup
		return m
	case model.AttachmentVideo:
		m := tgbotapi.NewVideo(chatID, tgbotapi.FileID(att.FileID))
		m.ReplyMarkup = markup
		return m
	case model.AttachmentVideoNote:
		m := tgbotapi.NewVideoNote(chatID, 1, tgbotapi.FileID(att.FileID))
		m.ReplyMarkup = markup
		return m
	case model.AttachmentAnimation:
		m := tgbotapi.NewAnimation(chatID, tgbotapi.FileID(att.FileID))
		m.ReplyMarkup = markup
		return m
	default:
		m := tgbotapi.NewDocument(chatID, tgbotapi.FileID(att.FileID))
		m.ReplyMarkup = markup
		return m
	}
}

// attachmentEdit строит editMessageMedia для вложения.
// Возвращает nil для типов, которые Telegram не позволяет редактировать
// (стикеры, голосовые, видео-кружки) — вызывающий код переотправляет их.
func (h *Handler) attachmentEdit(chatID int64, msgID int, att model.Attachment) tgbotapi.Chattable {
	markup := attachmentCloseMarkup()

	switch att.Type {
	case model.AttachmentPhoto:
		return tgbotapi.EditMessageMediaConfig{
			BaseEdit: tgbotapi.BaseEdit{ChatID: chatID, MessageID: msgID, ReplyMarkup: markup},
			Media:    tgbotapi.NewInputMediaPhoto(tgbotapi.FileID(att.FileID)),
		}
	case model.AttachmentDocument:
		return tgbotapi.EditMessageMediaConfig{
			BaseEdit: tgbotapi.BaseEdit{ChatID: chatID, MessageID: msgID, ReplyMarkup: markup},
			Media:    tgbotapi.NewInputMediaDocument(tgbotapi.FileID(att.FileID)),
		}
	case model.AttachmentAudio:
		return tgbotapi.EditMessageMediaConfig{
			BaseEdit: tgbotapi.BaseEdit{ChatID: chatID, MessageID: msgID, ReplyMarkup: markup},
			Media:    tgbotapi.NewInputMediaAudio(tgbotapi.FileID(att.FileID)),
		}
	case model.AttachmentVideo:
		return tgbotapi.EditMessageMediaConfig{
			BaseEdit: tgbotapi.BaseEdit{ChatID: chatID, MessageID: msgID, ReplyMarkup: markup},
			Media:    tgbotapi.NewInputMediaVideo(tgbotapi.FileID(att.FileID)),
		}
	case model.AttachmentAnimation:
		return tgbotapi.EditMessageMediaConfig{
			BaseEdit: tgbotapi.BaseEdit{ChatID: chatID, MessageID: msgID, ReplyMarkup: markup},
			Media:    tgbotapi.NewInputMediaAnimation(tgbotapi.FileID(att.FileID)),
		}
	default:
		return nil
	}
}

// ============================================================
// Attachment callbacks
// ============================================================

// callbackAttachments показывает список вложений заметки.
func (h *Handler) callbackAttachments(chatID int64, msgID int, userID int64, noteID int64) {
	s := h.states.Get(userID)
	s.AttachmentListMsgID = msgID
	s.AttachmentListNoteID = noteID
	h.showAttachmentList(chatID, msgID, userID, noteID)
}

// showAttachmentList рендерит список вложений в сообщении msgID (или новым, если edit не удался).
func (h *Handler) showAttachmentList(chatID int64, msgID int, userID int64, noteID int64) {
	atts, err := h.attachmentService.ListAttachments(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	text, markup := buildAttachmentsMessage(atts, noteID)
	if msgID != 0 {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		edit.ParseMode = tgbotapi.ModeMarkdown
		if _, err := h.api.Send(edit); err == nil || isNotModified(err) {
			s := h.states.Get(userID)
			s.AttachmentListMsgID = msgID
			s.AttachmentListNoteID = noteID
			return
		}
	}
	// fallback: edit не удался (например, разметка) — отправляем новое сообщение
	msg := h.newMsg(chatID, userID, text)
	msg.ParseMode = tgbotapi.ModeMarkdown
	msg.ReplyMarkup = markup
	if sent, err := h.api.Send(msg); err == nil {
		s := h.states.Get(userID)
		s.AttachmentListMsgID = sent.MessageID
		s.AttachmentListNoteID = noteID
	}
}

// callbackAddAttachment переводит бота в режим ожидания медиа-сообщения.
func (h *Handler) callbackAddAttachment(chatID int64, msgID int, userID int64, noteID int64) {
	if _, err := h.noteService.GetNote(userID, noteID); err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	session := h.states.Get(userID)
	session.State = StateWaitingAttachment
	session.AttachmentNoteID = noteID
	h.sendPrompt(chatID, userID, "📎 Отправь файл для прикрепления к заметке")
}

// callbackSendAttachment открывает вложение в едином окне просмотра.
func (h *Handler) callbackSendAttachment(chatID int64, userID int64, attID int64) {
	att, err := h.attachmentService.GetAttachment(userID, attID)
	if err != nil {
		h.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}
	h.showAttachmentView(chatID, userID, att)
}

// showAttachmentView показывает вложение в едином окне просмотра:
// переиспользует AttachmentViewMsgID (editMessageMedia при том же типе,
// иначе — удаляет старое сообщение и отправляет новое), под медиа — кнопка «❌ Закрыть».
func (h *Handler) showAttachmentView(chatID int64, userID int64, att model.Attachment) {
	session := h.states.Get(userID)

	if session.AttachmentViewMsgID != 0 {
		if session.AttachmentViewType == att.Type {
			if edit := h.attachmentEdit(chatID, session.AttachmentViewMsgID, att); edit != nil {
				if _, err := h.api.Send(edit); err == nil {
					return
				}
			}
		}
		// другой тип или edit не удался — переотправляем в окно просмотра
		h.api.Request(tgbotapi.NewDeleteMessage(chatID, session.AttachmentViewMsgID))
		session.AttachmentViewMsgID = 0
	}

	sent, err := h.api.Send(h.attachmentSend(chatID, att))
	if err != nil {
		return
	}
	session.AttachmentViewMsgID = sent.MessageID
	session.AttachmentViewType = att.Type
}

// clearAttachmentView удаляет окно просмотра вложения (если оно открыто).
func (h *Handler) clearAttachmentView(chatID int64, userID int64) {
	session := h.states.Get(userID)
	if session.AttachmentViewMsgID != 0 {
		h.api.Request(tgbotapi.NewDeleteMessage(chatID, session.AttachmentViewMsgID))
		session.AttachmentViewMsgID = 0
	}
}

// callbackCloseAttachment закрывает окно просмотра вложения по кнопке «❌ Закрыть».
func (h *Handler) callbackCloseAttachment(chatID int64, msgID int, userID int64) {
	session := h.states.Get(userID)
	if session.AttachmentViewMsgID == msgID {
		session.AttachmentViewMsgID = 0
	}
	h.api.Request(tgbotapi.NewDeleteMessage(chatID, msgID))
}

// askDeleteAttachment показывает подтверждение удаления вложения.
func (h *Handler) askDeleteAttachment(chatID int64, msgID int, userID int64, attID int64) {
	att, err := h.attachmentService.GetAttachment(userID, attID)
	if err != nil {
		log.Printf("attdel: GetAttachment(%d) ошибка: %v", attID, err)
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	text, markup := buildAttachmentDeleteConfirm(att)
	log.Printf("attdel: подтверждение type=%s name=%q text=%q", att.Type, att.FileName, text)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	if _, err := h.api.Send(edit); err == nil || isNotModified(err) {
		return
	}
	log.Printf("attdel: edit подтверждения не удался: %v", err)
	msg := h.newMsg(chatID, userID, text)
	msg.ParseMode = tgbotapi.ModeMarkdown
	msg.ReplyMarkup = markup
	if _, err := h.api.Send(msg); err != nil {
		log.Printf("attdel: fallback send не удался: %v", err)
	}
}

// doDeleteAttachment удаляет вложение и обновляет список.
func (h *Handler) doDeleteAttachment(chatID int64, msgID int, userID int64, attID int64) {
	att, err := h.attachmentService.GetAttachment(userID, attID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	noteID := att.NoteID

	if err := h.attachmentService.DeleteAttachment(userID, attID); err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	atts, _ := h.attachmentService.ListAttachments(userID, noteID)
	text, markup := buildAttachmentsMessage(atts, noteID)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	if _, err := h.api.Send(edit); err == nil || isNotModified(err) {
		return
	}
	msg := h.newMsg(chatID, userID, text)
	msg.ParseMode = tgbotapi.ModeMarkdown
	msg.ReplyMarkup = markup
	h.api.Send(msg)
}
