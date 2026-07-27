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
)

// UserSession хранит состояние и контекст пользователя.
type UserSession struct {
	State              State
	CurrentTopicID     int64  // 0 — без топика
	EditNoteID         int64  // ID заметки для редактирования в StateWaitingEditText
	LastViewedNoteID   int64  // ID последней просмотренной заметки (для SwitchInlineQuery)
	LastListMsgID      int    // ID последнего сообщения со списком
	PendingNoteText    string // текст заметки, ожидающий выбора приоритета
	PendingNoteTopicID int64  // топик для заметки, ожидающей приоритет
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
		s = &UserSession{State: StateIdle}
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
}
