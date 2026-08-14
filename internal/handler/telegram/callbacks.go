package telegram

import (
	"fmt"
	"strconv"
	"strings"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

// CallbackAction — тип действия callback-кнопки.
// Значения совпадают со строковыми префиксами callback_data (обратная совместимость
// со старыми нажатиями: строки менять нельзя).
type CallbackAction string

const (
	ActionBackToList     CallbackAction = "backtolist"
	ActionBackFolder     CallbackAction = "backfolder"
	ActionAddNote        CallbackAction = "addnote"
	ActionMoveUp         CallbackAction = "moveup"
	ActionMoveInsert     CallbackAction = "moveinsert"
	ActionDoneFolder     CallbackAction = "donefolder"
	ActionDelRemMsg      CallbackAction = "delremmsg" // спец-кейс: удаление сообщения-напоминания
	ActionCloseAtt       CallbackAction = "closeatt"
	ActionSetTopic       CallbackAction = "settopic"
	ActionView           CallbackAction = "view"
	ActionDelNote        CallbackAction = "delnote"
	ActionAskDel         CallbackAction = "askdel"
	ActionConfDel        CallbackAction = "confdel"
	ActionArchNote       CallbackAction = "archnote"
	ActionPage           CallbackAction = "page"
	ActionTopics         CallbackAction = "topics"
	ActionArchived       CallbackAction = "archived"
	ActionUnarch         CallbackAction = "unarch"
	ActionPrio           CallbackAction = "prio"
	ActionChPrio         CallbackAction = "chprio"
	ActionDone           CallbackAction = "done"
	ActionUndone         CallbackAction = "undone"
	ActionRemCal         CallbackAction = "remcal"
	ActionRemDay         CallbackAction = "remday"
	ActionRemHour        CallbackAction = "remhour"
	ActionRemMin         CallbackAction = "remmin"
	ActionRemMRange      CallbackAction = "remmrange"
	ActionRemRepeat      CallbackAction = "remrepeat"
	ActionRemClear       CallbackAction = "remclear"
	ActionRemMenu        CallbackAction = "remmenu"
	ActionMove           CallbackAction = "move"
	ActionMovePick       CallbackAction = "movepick"
	ActionMoveTopic      CallbackAction = "movetopic"
	ActionMoveCancel     CallbackAction = "movecancel"
	ActionOpenFolder     CallbackAction = "openfolder"
	ActionExpFolders     CallbackAction = "expfolders"
	ActionToggleSettings CallbackAction = "togglesettings"
	ActionCrumb          CallbackAction = "crumb"
	ActionExpand         CallbackAction = "expand"
	ActionCollapse       CallbackAction = "collapse"
	ActionAttachments    CallbackAction = "attachments"
	ActionAttAdd         CallbackAction = "attadd"
	ActionAttGet         CallbackAction = "attget"
	ActionAttDel         CallbackAction = "attdel"
	ActionAttConfDel     CallbackAction = "attconfdel"
)

// callbackHandler обрабатывает callback-нажатие.
// arg — часть callback_data после "action:" (может быть пустой).
type callbackHandler func(h *Handler, chatID int64, msgID int, userID int64, arg string)

// noArg адаптирует обработчик без аргумента.
func noArg(fn func(h *Handler, chatID int64, msgID int, userID int64)) callbackHandler {
	return func(h *Handler, chatID int64, msgID int, userID int64, _ string) {
		fn(h, chatID, msgID, userID)
	}
}

// noArgNoMsgID адаптирует обработчик без аргумента и без msgID.
func noArgNoMsgID(fn func(h *Handler, chatID int64, userID int64)) callbackHandler {
	return func(h *Handler, chatID int64, msgID int, userID int64, _ string) {
		fn(h, chatID, userID)
	}
}

// withNoteID адаптирует обработчик, ожидающий int64-аргумент (ID заметки/папки/топика).
func withNoteID(fn func(h *Handler, chatID int64, msgID int, userID int64, id int64)) callbackHandler {
	return func(h *Handler, chatID int64, msgID int, userID int64, arg string) {
		id, err := strconv.ParseInt(arg, 10, 64)
		if err != nil {
			return
		}
		fn(h, chatID, msgID, userID, id)
	}
}

// withNoteIDNoMsgID адаптирует обработчик с int64-аргументом, но без msgID.
func withNoteIDNoMsgID(fn func(h *Handler, chatID int64, userID int64, id int64)) callbackHandler {
	return func(h *Handler, chatID int64, msgID int, userID int64, arg string) {
		id, err := strconv.ParseInt(arg, 10, 64)
		if err != nil {
			return
		}
		fn(h, chatID, userID, id)
	}
}

// withInt адаптирует обработчик, ожидающий int-аргумент (например, приоритет).
func withInt(fn func(h *Handler, chatID int64, msgID int, userID int64, n int)) callbackHandler {
	return func(h *Handler, chatID int64, msgID int, userID int64, arg string) {
		n, err := strconv.Atoi(arg)
		if err != nil {
			return
		}
		fn(h, chatID, msgID, userID, n)
	}
}

// callbackHandlers — реестр обработчиков callback-действий.
var callbackHandlers = map[CallbackAction]callbackHandler{
	// Без аргументов
	ActionBackToList: noArg((*Handler).callbackBackToList),
	ActionBackFolder: noArg((*Handler).callbackBackFolder),
	ActionAddNote:    noArgNoMsgID((*Handler).callbackAddNote),
	ActionMoveUp:     noArg((*Handler).callbackMoveUp),
	ActionMoveInsert: noArg((*Handler).callbackMoveInsert),
	ActionDoneFolder: noArg((*Handler).callbackDoneFolder),
	ActionCloseAtt:   noArg((*Handler).callbackCloseAttachment),

	// С int64-аргументом (ID)
	ActionSetTopic:    withNoteID((*Handler).callbackSetTopic),
	ActionView:        withNoteID((*Handler).callbackViewNote),
	ActionDelNote:     withNoteIDNoMsgID((*Handler).callbackDeleteNote),
	ActionAskDel:      withNoteID((*Handler).askDeleteNote),
	ActionConfDel:     withNoteIDNoMsgID((*Handler).doDelete),
	ActionArchNote:    withNoteIDNoMsgID((*Handler).callbackArchiveNote),
	ActionUnarch:      withNoteID((*Handler).doUnarchive),
	ActionChPrio:      withNoteID((*Handler).callbackChangePriority),
	ActionDone:        withNoteID((*Handler).callbackMarkDone),
	ActionUndone:      withNoteID((*Handler).callbackMarkUndone),
	ActionRemClear:    withNoteID((*Handler).callbackClearReminder),
	ActionRemMenu:     withNoteID((*Handler).callbackReminderMenu),
	ActionMove:        withNoteID((*Handler).callbackMovePicker),
	ActionMovePick:    withNoteID((*Handler).callbackMoveNavigate),
	ActionMoveTopic:   withNoteID((*Handler).callbackMoveTopic),
	ActionMoveCancel:  withNoteID((*Handler).callbackMoveCancel),
	ActionOpenFolder:  withNoteID((*Handler).callbackOpenFolder),
	ActionExpFolders:  withNoteID((*Handler).callbackToggleExpandedFolders),
	ActionCrumb:       withNoteID((*Handler).callbackCrumb),
	ActionExpand:      withNoteID((*Handler).callbackExpandNote),
	ActionCollapse:    withNoteID((*Handler).callbackCollapseNote),
	ActionAttachments: withNoteID((*Handler).callbackAttachments),
	ActionAttAdd:      withNoteID((*Handler).callbackAddAttachment),
	ActionAttGet:      withNoteIDNoMsgID((*Handler).callbackSendAttachment),
	ActionAttDel:      withNoteID((*Handler).askDeleteAttachment),
	ActionAttConfDel:  withNoteID((*Handler).doDeleteAttachment),

	// С int-аргументом
	ActionPrio: withInt((*Handler).callbackSetPriority),

	// С строковым аргументом (передаётся как есть)
	ActionToggleSettings: (*Handler).callbackToggleSettings,
	ActionRemCal:         (*Handler).callbackReminderCalendar,
	ActionRemDay:         (*Handler).callbackReminderDay,
	ActionRemHour:        (*Handler).callbackReminderHour,
	ActionRemMin:         (*Handler).callbackReminderMinute,
	ActionRemMRange:      (*Handler).callbackReminderMinuteRange,
	ActionRemRepeat:      (*Handler).callbackReminderRepeat,

	// Без аргумента, но с особым разбором data
	ActionTopics:   noArg((*Handler).callbackTopicsFromList),
	ActionArchived: noArg((*Handler).callbackShowArchived),

	// page имеет составной аргумент "page:2:3" → arg="2:3"
	ActionPage: func(h *Handler, chatID int64, msgID int, userID int64, arg string) {
		subParts := strings.SplitN(arg, ":", 2)
		if len(subParts) != 2 {
			return
		}
		page, err := strconv.Atoi(subParts[1])
		if err != nil {
			return
		}
		h.showListPage(chatID, msgID, userID, page)
	},
}

// callbackTopicsFromList — обёртка cmdTopicsFromList под сигнатуру без аргумента.
func (h *Handler) callbackTopicsFromList(chatID int64, msgID int, userID int64) {
	h.cmdTopicsFromList(chatID, msgID, userID)
}

// callbackShowArchived — обёртка showArchived под сигнатуру без аргумента.
func (h *Handler) callbackShowArchived(chatID int64, msgID int, userID int64) {
	h.showArchived(chatID, msgID, userID)
}

// handleCallback разбирает callback_data и делегирует обработку типизированному диспетчеру.
func (h *Handler) handleCallback(cb *tgbotapi.CallbackQuery) {
	userID := cb.From.ID
	data := cb.Data
	chatID := cb.Message.Chat.ID
	msgID := cb.Message.MessageID

	h.api.Request(tgbotapi.NewCallback(cb.ID, ""))

	// Спец-кейс: удаление сообщения-напоминания (action с аргументом, обработчик не нужен)
	if strings.HasPrefix(data, string(ActionDelRemMsg)+":") {
		del := tgbotapi.NewDeleteMessage(chatID, msgID)
		h.api.Request(del)
		h.api.Request(tgbotapi.NewCallback(cb.ID, ""))
		return
	}

	action, arg, hasArg := strings.Cut(data, ":")
	handler, ok := callbackHandlers[CallbackAction(action)]
	if !ok {
		// Неизвестное действие: без ":" — отвечаем пустым edit, иначе молча игнорируем.
		if !hasArg {
			h.callbackAnswer(chatID, msgID, "")
		}
		return
	}
	handler(h, chatID, msgID, userID, arg)
}

// --- Callback implementations (notes) ---

func (h *Handler) callbackSetTopic(chatID int64, msgID int, userID int64, topicID int64) {
	if topicID != 0 {
		_, err := h.topicService.GetTopic(userID, topicID)
		if err != nil {
			h.send(chatID, fmt.Sprintf("❌ %v", err))
			return
		}
		h.states.Get(userID).CurrentTopicID = topicID
	} else {
		h.states.Get(userID).CurrentTopicID = 0
	}
	h.states.Get(userID).CurrentFolderID = nil
	h.states.Get(userID).DoneFolderActive = false
	h.states.Get(userID).ExpandedFolders = make(map[int64]bool) // сброс авто-схлопывания при смене топика
	h.states.Get(userID).LastListMsgID = msgID
	h.showListPage(chatID, msgID, userID, 0)
}

func (h *Handler) callbackViewNote(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	session := h.states.Get(userID)
	session.ExpandedNoteID = 0 // новый просмотр — свёрнутый вид
	tzOffset := session.TimezoneOffset

	// Переход на другую заметку — закрываем окно просмотра вложений предыдущей
	if session.LastViewedNoteID != note.ID {
		h.clearAttachmentView(chatID, userID)
		session.LastViewedNoteID = note.ID
	}

	text, markup := buildViewNoteMessage(note, false, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)
}

// callbackExpandNote раскрывает дополнительные кнопки действий над заметкой.
func (h *Handler) callbackExpandNote(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	h.states.Get(userID).ExpandedNoteID = noteID
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildViewNoteMessage(note, true, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)
}

// callbackCollapseNote сворачивает дополнительные кнопки действий над заметкой.
func (h *Handler) callbackCollapseNote(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	h.states.Get(userID).ExpandedNoteID = 0
	tzOffset := h.states.Get(userID).TimezoneOffset
	text, markup := buildViewNoteMessage(note, false, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)
}

func (h *Handler) askDeleteNote(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}
	text, markup := buildDeleteConfirmMessage(note)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)
}

func (h *Handler) callbackDeleteNote(chatID int64, userID int64, noteID int64) {
	h.doDelete(chatID, userID, noteID)
}

func (h *Handler) callbackArchiveNote(chatID, userID, noteID int64) {
	h.doArchive(chatID, userID, noteID)
}

func (h *Handler) callbackSetPriority(chatID int64, msgID int, userID int64, priority int) {
	session := h.states.Get(userID)
	text := session.PendingNoteText
	topicID := session.PendingNoteTopicID
	folderID := session.CurrentFolderID
	lastMsgID := session.LastListMsgID

	h.states.Reset(userID)

	_, err := h.noteService.AddNote(userID, topicID, folderID, text, priority)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	// Удаляем сообщение с выбором приоритета
	del := tgbotapi.NewDeleteMessage(chatID, msgID)
	h.api.Request(del)

	// Редактируем существующий список (или шлём новый, если не было)
	h.showListPage(chatID, lastMsgID, userID, 0)
}

func (h *Handler) callbackChangePriority(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	// Циклическое переключение: None→Low→Medium→High→None
	newPriority := (note.Priority + 1) % 4
	if err := h.noteService.SetPriority(userID, noteID, newPriority); err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	// Обновляем заметку в памяти для перерисовки
	note.Priority = newPriority

	// Кнопка chprio доступна только в развёрнутом режиме — сохраняем expanded
	session := h.states.Get(userID)
	tzOffset := session.TimezoneOffset
	text, markup := buildViewNoteMessage(note, true, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)

	// Обновляем список в фоне
	lastMsgID := session.LastListMsgID
	if lastMsgID != 0 && lastMsgID != msgID {
		h.showListPage(chatID, lastMsgID, userID, 0)
	}
}

func (h *Handler) callbackMarkDone(chatID int64, msgID int, userID int64, noteID int64) {
	if err := h.noteService.MarkDone(userID, noteID); err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	session := h.states.Get(userID)
	expanded := session.ExpandedNoteID == noteID
	tzOffset := session.TimezoneOffset
	text, markup := buildViewNoteMessage(note, expanded, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)

	// Обновляем список в фоне
	lastMsgID := session.LastListMsgID
	if lastMsgID != 0 && lastMsgID != msgID {
		h.showListPage(chatID, lastMsgID, userID, 0)
	}
}

func (h *Handler) callbackMarkUndone(chatID int64, msgID int, userID int64, noteID int64) {
	if err := h.noteService.MarkUndone(userID, noteID); err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	session := h.states.Get(userID)
	expanded := session.ExpandedNoteID == noteID
	tzOffset := session.TimezoneOffset
	text, markup := buildViewNoteMessage(note, expanded, tzOffset)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)

	// Обновляем список в фоне
	lastMsgID := session.LastListMsgID
	if lastMsgID != 0 && lastMsgID != msgID {
		h.showListPage(chatID, lastMsgID, userID, 0)
	}
}

func (h *Handler) callbackBackToList(chatID int64, msgID int, userID int64) {
	session := h.states.Get(userID)
	session.DoneFolderActive = false
	session.ExpandedNoteID = 0
	h.clearAttachmentView(chatID, userID)
	h.showListPage(chatID, msgID, userID, 0)
}

func (h *Handler) callbackAddNote(chatID int64, userID int64) {
	h.states.SetState(userID, StateWaitingAddText)
	h.sendPrompt(chatID, userID, "📝 Введите текст заметки:")
}

// isNotModified возвращает true, если ошибка означает "сообщение не изменилось".
func isNotModified(err error) bool {
	return err != nil && strings.Contains(err.Error(), "not modified")
}

func (h *Handler) callbackAnswer(chatID int64, msgID int, text string) {
	edit := tgbotapi.NewEditMessageText(chatID, msgID, text)
	h.api.Send(edit)
}
