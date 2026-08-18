package telegram

// State — состояние диалога с пользователем.
type State int

const (
	StateIdle State = iota
	StateWaitingAddText
	StateWaitingPriority // выбор приоритета (текст уже получен)
	StateWaitingDeleteID
	StateWaitingEditArgs
	StateWaitingEditText // только текст (ID уже известен)
	StateWaitingArchiveID
	StateWaitingNewTopic
	StateWaitingSetTopic
	StateWaitingNewFolder
	StateWaitingAttachment // ждём медиа-сообщение для прикрепления к заметке
)

// UserSession хранит состояние и контекст пользователя.
type UserSession struct {
	State              State
	CurrentTopicID     int64  // 0 — без топика
	CurrentFolderID    *int64 // nil — корень топика (не в папке)
	EditNoteID         int64  // ID заметки для редактирования в StateWaitingEditText
	LastViewedNoteID   int64  // ID последней просмотренной заметки (для SwitchInlineQuery)
	LastListMsgID      int    // ID последнего сообщения со списком
	PendingNoteText    string // текст заметки, ожидающий выбора приоритета
	PendingNoteTopicID int64  // топик для заметки, ожидающей приоритет
	PromptMsgID        int    // ID сообщения-подсказки для удаления
	PendingCmdMsgID    int    // ID сообщения-команды (для удаления после finish)

	// Режим перемещения
	MoveNoteID          int64  // ID заметки, которую перемещаем
	MoveTopicID         int64  // топик, в контексте которого перемещаем
	MoveCurrentFolderID *int64 // текущая папка в навигаторе перемещения (nil = корень)

	// Настройки
	ShowCounts       bool // показывать количество заметок и папок рядом с названиями
	BreadcrumbInline bool // хлебные крошки inline-кнопками вместо текста
	BreadcrumbBottom bool // крошки внизу (только при BreadcrumbInline=true)
	ShowKeyboard     bool // показывать быструю клавиатуру
	TimezoneOffset   int  // смещение часового пояса от Москвы (0 = МСК, UTC+3)
	FoldersCollapsed bool // схлопывать папки уровня в одну кнопку
	SettingsLoaded   bool // настройки уже загружены из хранилища (однократно за процесс)

	// Состояние схлопывания папок (в рамках текущего топика).
	// Ключ уровня: 0 — корень топика, иначе ID папки-родителя.
	ExpandedFolders map[int64]bool // уровни, развёрнутые пользователем вручную

	// Виртуальная папка выполненных
	DoneFolderActive bool // активен режим просмотра выполненных заметок

	// Состояние развёрнутого просмотра заметки
	ExpandedNoteID int64 // ID заметки, для которой раскрыты доп. кнопки (0 — свёрнуто)

	// Вложения
	AttachmentNoteID     int64 // ID заметки, к которой прикрепляем вложение (StateWaitingAttachment)
	AttachmentListMsgID  int   // ID сообщения со списком вложений (чтобы оставаться на нём после прикрепления)
	AttachmentListNoteID int64 // ID заметки, чей список вложений открыт (для обновления при простом прикреплении)
	AttachmentViewMsgID  int   // ID сообщения-окна просмотра вложения (единое, переиспользуется)
}

// StateManager управляет состояниями пользователей.
type StateManager struct {
	sessions map[int64]*UserSession
}

// NewStateManager создаёт новый StateManager.
func NewStateManager() *StateManager {
	return &StateManager{sessions: make(map[int64]*UserSession)}
}

// Get возвращает сессию пользователя (создаёт, если нет).
func (sm *StateManager) Get(userID int64) *UserSession {
	s, ok := sm.sessions[userID]
	if !ok {
		s = &UserSession{State: StateIdle, ExpandedFolders: make(map[int64]bool)}
		sm.sessions[userID] = s
	}
	return s
}

// SetState меняет состояние пользователя.
func (sm *StateManager) SetState(userID int64, state State) {
	sm.Get(userID).State = state
}

// Reset сбрасывает состояние в Idle.
func (sm *StateManager) Reset(userID int64) {
	s := sm.Get(userID)
	s.State = StateIdle
	s.EditNoteID = 0
	s.PendingNoteText = ""
	s.AttachmentNoteID = 0
}
