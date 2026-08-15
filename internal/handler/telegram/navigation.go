package telegram

import (
	"fmt"
	"strings"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"

	"todo-bot-tg/internal/model"
)

// ============================================================
// Topics / list rendering
// ============================================================

func (h *Handler) showTopics(chatID int64, msgID int, userID int64) {
	currentID := h.states.Get(userID).CurrentTopicID
	topics, err := h.topicService.ListTopics(userID)
	if err != nil {
		h.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}

	if len(topics) == 0 {
		text := "📂 Топиков пока нет. Создайте новый: /newtopic <название>"
		if msgID != 0 {
			edit := tgbotapi.NewEditMessageText(chatID, msgID, text)
			if _, err := h.api.Send(edit); err == nil {
				return
			}
		}
		h.send(chatID, text)
		return
	}

	counts := make(map[int64]int)
	folderCounts := make(map[int64]int)
	showCounts := h.states.Get(userID).ShowCounts
	for _, t := range topics {
		c, _ := h.noteService.CountNotes(userID, t.ID, nil)
		counts[t.ID] = c
		fc, _ := h.folderService.CountFolders(userID, t.ID, nil)
		folderCounts[t.ID] = fc
	}

	text, markup := buildTopicsMessage(topics, currentID, userID, counts, folderCounts, showCounts)

	if msgID != 0 {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		edit.ParseMode = tgbotapi.ModeMarkdown
		if _, err := h.api.Send(edit); err == nil || isNotModified(err) {
			return
		}
	}
	msg := h.newMsg(chatID, userID, text)
	msg.ParseMode = tgbotapi.ModeMarkdown
	msg.ReplyMarkup = markup
	sent, err := h.api.Send(msg)
	if err == nil {
		h.states.Get(userID).LastListMsgID = sent.MessageID
	}
}

func (h *Handler) showList(chatID int64, userID int64) {
	h.states.Get(userID).DoneFolderActive = false
	h.showListPage(chatID, 0, userID, 0)
}

func (h *Handler) showListPage(chatID int64, msgID int, userID int64, page int) {
	const perPage = 10
	session := h.states.Get(userID)
	topicID := session.CurrentTopicID
	folderID := session.CurrentFolderID

	// Режим виртуальной папки выполненных
	if session.DoneFolderActive && topicID != 0 {
		h.showDoneFolderPage(chatID, msgID, userID, topicID, folderID, page, perPage)
		return
	}

	// Получаем папки в текущем контексте (только если выбран топик)
	var folders []model.Folder
	var folderChain []model.Folder
	var topicName string
	if topicID != 0 {
		folders, _ = h.folderService.ListFolders(userID, topicID, folderID)
		if folderID != nil {
			folderChain, _ = h.folderService.GetFolderChain(*folderID)
		}
		if t, err := h.topicService.GetTopic(userID, topicID); err == nil {
			topicName = t.Name
		}
	}

	notes, err := h.noteService.ListNotes(userID, topicID, folderID)
	if err != nil {
		h.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}

	// Скрываем выполненные заметки из основного списка (только в «✅ Выполненные»)
	var activeNotes []model.Note
	for _, n := range notes {
		if !n.Done {
			activeNotes = append(activeNotes, n)
		}
	}
	notes = activeNotes

	// Считаем выполненные для виртуальной папки (только в корне топика)
	doneCount := 0
	if topicID != 0 {
		doneCount, _ = h.noteService.CountDoneNotes(userID, topicID, folderID)
	}

	// Авто-схлопывание папок уровня (настройка): если папок больше одной
	// и уровень не развёрнут вручную — показываем одну кнопку.
	levelKey := int64(0)
	if folderID != nil {
		levelKey = *folderID
	}
	foldersCollapsed := foldersCollapseState(session.FoldersCollapsed, len(folders), session.ExpandedFolders, levelKey)

	// Закреплённые заметки идут выше папок: pinned → папки → остальные заметки
	var pinnedNotes, restNotes []model.Note
	for _, n := range notes {
		if n.Pinned {
			pinnedNotes = append(pinnedNotes, n)
		} else {
			restNotes = append(restNotes, n)
		}
	}
	folderItems := len(folders)
	if foldersCollapsed {
		folderItems = 1
	}
	totalItems := len(pinnedNotes) + folderItems + len(restNotes)
	doneFolderActive := false
	showCounts := session.ShowCounts
	breadcrumbInline := session.BreadcrumbInline

	// Пустой список
	if totalItems == 0 && doneCount == 0 {
		text, markup := buildListMessage(nil, topicID, topicName, folderID, folderChain, 0, 1, showCounts, breadcrumbInline, session.BreadcrumbBottom, 0, doneFolderActive)
		if msgID != 0 {
			edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
			if _, err := h.api.Send(edit); err == nil || isNotModified(err) {
				return
			}
		}
		msg := h.newMsg(chatID, userID, text)
		msg.ReplyMarkup = markup
		sent, err := h.api.Send(msg)
		if err == nil {
			h.states.Get(userID).LastListMsgID = sent.MessageID
		}
		return
	}

	totalPages := (totalItems + perPage - 1) / perPage
	if totalPages == 0 {
		totalPages = 1
	}
	if page < 0 {
		page = 0
	}
	if page >= totalPages {
		page = totalPages - 1
	}

	start := page * perPage
	end := start + perPage
	if end > totalItems {
		end = totalItems
	}

	// Собираем элементы страницы: закреплённые заметки → папки → остальные заметки
	allItems := make([]listItem, 0, totalItems)
	for _, n := range pinnedNotes {
		allItems = append(allItems, listItem{isFolder: false, note: n})
	}
	if foldersCollapsed {
		names := make([]string, len(folders))
		for j, f := range folders {
			names[j] = f.Name
		}
		allItems = append(allItems, listItem{isCollapsed: true, levelKey: levelKey, folderNames: names})
	} else {
		for _, f := range folders {
			item := listItem{isFolder: true, folder: f}
			if showCounts {
				item.noteCount, _ = h.noteService.CountNotes(userID, topicID, &f.ID)
				item.folderCount, _ = h.folderService.CountFolders(userID, topicID, &f.ID)
			}
			allItems = append(allItems, item)
		}
	}
	for _, n := range restNotes {
		allItems = append(allItems, listItem{isFolder: false, note: n})
	}
	pageItems := allItems[start:end]

	text, markup := buildListMessage(pageItems, topicID, topicName, folderID, folderChain, page, totalPages, showCounts, breadcrumbInline, session.BreadcrumbBottom, doneCount, doneFolderActive)

	if msgID != 0 {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		if _, err := h.api.Send(edit); err == nil || isNotModified(err) {
			return
		}
	}
	msg2 := tgbotapi.NewMessage(chatID, text)
	msg2.ReplyMarkup = markup
	sent, err := h.api.Send(msg2)
	if err == nil {
		h.states.Get(userID).LastListMsgID = sent.MessageID
	}
}

// showDoneFolderPage — страница виртуальной папки выполненных заметок.
func (h *Handler) showDoneFolderPage(chatID int64, msgID int, userID int64, topicID int64, folderID *int64, page int, perPage int) {
	session := h.states.Get(userID)

	var topicName string
	if t, err := h.topicService.GetTopic(userID, topicID); err == nil {
		topicName = t.Name
	}

	// Получаем заметки текущей папки и фильтруем только выполненные
	notes, err := h.noteService.ListNotes(userID, topicID, folderID)
	if err != nil {
		h.send(chatID, fmt.Sprintf("❌ %v", err))
		return
	}

	var doneNotes []model.Note
	for _, n := range notes {
		if n.Done {
			doneNotes = append(doneNotes, n)
		}
	}

	totalItems := len(doneNotes)
	if totalItems == 0 {
		// Не должно случиться, но на всякий случай — возвращаемся в список
		session.DoneFolderActive = false
		h.showList(chatID, userID)
		return
	}

	// Цепочка папок для breadcrumb
	var folderChain []model.Folder
	if folderID != nil {
		folderChain, _ = h.folderService.GetFolderChain(*folderID)
	}

	totalPages := (totalItems + perPage - 1) / perPage
	if totalPages == 0 {
		totalPages = 1
	}
	if page < 0 {
		page = 0
	}
	if page >= totalPages {
		page = totalPages - 1
	}

	start := page * perPage
	end := start + perPage
	if end > totalItems {
		end = totalItems
	}

	var pageItems []listItem
	for i := start; i < end; i++ {
		pageItems = append(pageItems, listItem{isFolder: false, note: doneNotes[i]})
	}

	text, markup := buildListMessage(pageItems, topicID, topicName, folderID, folderChain, page, totalPages, session.ShowCounts, session.BreadcrumbInline, session.BreadcrumbBottom, 0, true)

	if msgID != 0 {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		if _, err := h.api.Send(edit); err == nil || isNotModified(err) {
			return
		}
	}
	msg2 := tgbotapi.NewMessage(chatID, text)
	msg2.ReplyMarkup = markup
	sent, err := h.api.Send(msg2)
	if err == nil {
		session.LastListMsgID = sent.MessageID
	}
}

func (h *Handler) showArchived(chatID int64, msgID int, userID int64) {
	notes, err := h.noteService.ListArchived(userID)
	if err != nil {
		if msgID != 0 {
			h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		} else {
			h.send(chatID, fmt.Sprintf("❌ %v", err))
		}
		return
	}

	text, markup := buildArchivedMessage(notes)

	if msgID != 0 {
		edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
		if _, err := h.api.Send(edit); err == nil {
			return
		} else if isNotModified(err) {
			return
		}
	}
	msg2 := h.newMsg(chatID, userID, text)
	msg2.ReplyMarkup = markup
	sent, err := h.api.Send(msg2)
	if err == nil {
		h.states.Get(userID).LastListMsgID = sent.MessageID
	}
}

// ============================================================
// Folder navigation callbacks
// ============================================================

func (h *Handler) callbackOpenFolder(chatID int64, msgID int, userID int64, folderID int64) {
	session := h.states.Get(userID)
	session.CurrentFolderID = &folderID
	h.states.Get(userID).LastListMsgID = msgID
	h.showListPage(chatID, msgID, userID, 0)
}

// foldersCollapseState определяет, нужно ли авто-схлопывать папки уровня.
// Уровень схлопывается, если настройка включена, папок больше одной
// и пользователь не развернул этот уровень вручную.
func foldersCollapseState(enabled bool, folderCount int, expandedLevels map[int64]bool, levelKey int64) bool {
	return enabled && folderCount > 1 && !expandedLevels[levelKey]
}

// callbackToggleExpandedFolders разворачивает/сворачивает папки текущего уровня.
// levelKey: 0 — корень топика, иначе ID папки-родителя.
func (h *Handler) callbackToggleExpandedFolders(chatID int64, msgID int, userID int64, levelKey int64) {
	session := h.states.Get(userID)
	if session.ExpandedFolders == nil {
		session.ExpandedFolders = make(map[int64]bool)
	}
	session.ExpandedFolders[levelKey] = !session.ExpandedFolders[levelKey]
	h.showListPage(chatID, msgID, userID, 0)
}

func (h *Handler) callbackCrumb(chatID int64, msgID int, userID int64, folderID int64) {
	if folderID == 0 {
		// Переход к списку топиков
		h.states.Get(userID).DoneFolderActive = false
		h.cmdTopicsFromList(chatID, msgID, userID)
		return
	}
	session := h.states.Get(userID)
	session.DoneFolderActive = false
	if folderID == -1 {
		// Переход в корень текущего топика
		session.CurrentFolderID = nil
	} else {
		session.CurrentFolderID = &folderID
	}
	h.showListPage(chatID, msgID, userID, 0)
}

func (h *Handler) callbackDoneFolder(chatID int64, msgID int, userID int64) {
	h.states.Get(userID).DoneFolderActive = true
	h.showListPage(chatID, msgID, userID, 0)
}

func (h *Handler) callbackBackFolder(chatID int64, msgID int, userID int64) {
	session := h.states.Get(userID)
	if session.CurrentFolderID == nil {
		// Уже в корне — возвращаемся к списку топиков
		return
	}
	// Поднимаемся на уровень выше: ищем родительскую папку
	currentFolder, err := h.folderService.GetFolder(userID, *session.CurrentFolderID)
	if err != nil {
		session.CurrentFolderID = nil
	} else {
		session.CurrentFolderID = currentFolder.ParentFolderID
	}
	h.showListPage(chatID, msgID, userID, 0)
}

// tryNavigateFolder пытается интерпретировать неизвестную команду как имя папки
// и перейти в неё. Используется для кликабельных имён папок в breadcrumb.
func (h *Handler) tryNavigateFolder(msg *tgbotapi.Message, userID int64, cmd string, args string) bool {
	session := h.states.Get(userID)
	if session.CurrentTopicID == 0 {
		return false
	}

	// Ключ для сравнения: команда + аргументы через _ (как в breadcrumb)
	key := strings.ToUpper(cmd)
	if args != "" {
		key = strings.ToUpper(cmd) + "_" + strings.ToUpper(strings.ReplaceAll(args, " ", "_"))
	}

	// matchKey возвращает ключ для сравнения с командой
	matchKey := func(name string) string {
		return strings.ToUpper(sanitize(name))
	}

	// Проверяем имя топика — переход в корень топика
	if t, err := h.topicService.GetTopic(userID, session.CurrentTopicID); err == nil && matchKey(t.Name) == key {
		session.CurrentFolderID = nil
		session.DoneFolderActive = false
		h.deleteUserMsg(msg)
		h.showListPage(msg.Chat.ID, session.LastListMsgID, userID, 0)
		return true
	}

	// Ищем в цепочке папок (breadcrumb)
	if session.CurrentFolderID != nil {
		chain, err := h.folderService.GetFolderChain(*session.CurrentFolderID)
		if err == nil {
			for i, f := range chain {
				if matchKey(f.Name) == key {
					// Последняя в цепочке — текущая папка → на уровень выше
					if i == len(chain)-1 {
						session.CurrentFolderID = f.ParentFolderID
					} else {
						session.CurrentFolderID = &f.ID
					}
					session.DoneFolderActive = false
					h.deleteUserMsg(msg)
					h.showListPage(msg.Chat.ID, session.LastListMsgID, userID, 0)
					return true
				}
			}
		}
	}

	// Ищем среди папок текущего уровня
	folders, err := h.folderService.ListFolders(userID, session.CurrentTopicID, session.CurrentFolderID)
	if err == nil {
		for _, f := range folders {
			if matchKey(f.Name) == key {
				session.CurrentFolderID = &f.ID
				h.deleteUserMsg(msg)
				h.showListPage(msg.Chat.ID, session.LastListMsgID, userID, 0)
				return true
			}
		}
	}

	return false
}

// ============================================================
// Move navigator
// ============================================================

// showMoveNavigator отрисовывает навигатор перемещения на основе текущего состояния сессии.
func (h *Handler) showMoveNavigator(chatID int64, msgID int, userID int64) {
	session := h.states.Get(userID)
	note, err := h.noteService.GetNote(userID, session.MoveNoteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	allTopics, _ := h.topicService.ListTopics(userID)
	folders, _ := h.folderService.ListFolders(userID, session.MoveTopicID, session.MoveCurrentFolderID)

	var folderChain []model.Folder
	if session.MoveCurrentFolderID != nil {
		folderChain, _ = h.folderService.GetFolderChain(*session.MoveCurrentFolderID)
	}

	text, markup := buildMoveNavigator(note, session.MoveTopicID, session.MoveCurrentFolderID, folders, folderChain, allTopics)
	edit := tgbotapi.NewEditMessageTextAndMarkup(chatID, msgID, text, markup)
	edit.ParseMode = tgbotapi.ModeMarkdown
	h.api.Send(edit)
}

// callbackMovePicker инициализирует режим перемещения заметки.
func (h *Handler) callbackMovePicker(chatID int64, msgID int, userID int64, noteID int64) {
	note, err := h.noteService.GetNote(userID, noteID)
	if err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	// Определяем топик заметки (или берём текущий)
	topicID := note.TopicID
	if topicID == 0 {
		topicID = h.states.Get(userID).CurrentTopicID
	}

	allTopics, _ := h.topicService.ListTopics(userID)
	if topicID == 0 && len(allTopics) > 0 {
		topicID = allTopics[0].ID
	}

	// Устанавливаем состояние перемещения
	session := h.states.Get(userID)
	session.MoveNoteID = noteID
	session.MoveTopicID = topicID
	session.MoveCurrentFolderID = nil // начинаем с корня топика

	h.showMoveNavigator(chatID, msgID, userID)
}

// callbackMoveNavigate заходит в папку в режиме перемещения.
func (h *Handler) callbackMoveNavigate(chatID int64, msgID int, userID int64, folderID int64) {
	session := h.states.Get(userID)
	session.MoveCurrentFolderID = &folderID
	h.showMoveNavigator(chatID, msgID, userID)
}

// callbackMoveUp поднимается на уровень выше в режиме перемещения.
func (h *Handler) callbackMoveUp(chatID int64, msgID int, userID int64) {
	session := h.states.Get(userID)
	if session.MoveCurrentFolderID == nil {
		return // уже в корне
	}
	folder, err := h.folderService.GetFolder(userID, *session.MoveCurrentFolderID)
	if err != nil {
		session.MoveCurrentFolderID = nil
	} else {
		session.MoveCurrentFolderID = folder.ParentFolderID
	}
	h.showMoveNavigator(chatID, msgID, userID)
}

// callbackMoveInsert выполняет вставку заметки в текущую позицию навигатора.
func (h *Handler) callbackMoveInsert(chatID int64, msgID int, userID int64) {
	session := h.states.Get(userID)

	if err := h.noteService.MoveNote(userID, session.MoveNoteID, session.MoveTopicID, session.MoveCurrentFolderID); err != nil {
		h.callbackAnswer(chatID, msgID, fmt.Sprintf("❌ %v", err))
		return
	}

	// Сбрасываем состояние перемещения
	session.MoveNoteID = 0
	session.MoveTopicID = 0
	session.MoveCurrentFolderID = nil

	// Перерисовываем список
	h.refreshList(chatID, userID)
}

// callbackMoveTopic переключает топик в режиме перемещения.
func (h *Handler) callbackMoveTopic(chatID int64, msgID int, userID int64, topicID int64) {
	session := h.states.Get(userID)
	session.MoveTopicID = topicID
	session.MoveCurrentFolderID = nil // сбрасываем на корень нового топика
	h.showMoveNavigator(chatID, msgID, userID)
}

// callbackMoveCancel отменяет перемещение и возвращает к просмотру заметки.
func (h *Handler) callbackMoveCancel(chatID int64, msgID int, userID int64, noteID int64) {
	session := h.states.Get(userID)
	session.MoveNoteID = 0
	session.MoveTopicID = 0
	session.MoveCurrentFolderID = nil
	h.callbackViewNote(chatID, msgID, userID, noteID)
}
