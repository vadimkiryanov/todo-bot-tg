package telegram

import (
	"testing"

	"todo-bot-tg/internal/model"
)

func TestStateManager_Get_CreatesSession(t *testing.T) {
	sm := NewStateManager()
	session := sm.Get(123)
	if session == nil {
		t.Fatal("Get() returned nil")
	}
	if session.State != StateIdle {
		t.Errorf("State = %d, want StateIdle", session.State)
	}
}

func TestStateManager_Get_SameSession(t *testing.T) {
	sm := NewStateManager()
	s1 := sm.Get(123)
	s2 := sm.Get(123)
	if s1 != s2 {
		t.Error("Get() returned different sessions for same userID")
	}
}

func TestStateManager_Get_DifferentUsers(t *testing.T) {
	sm := NewStateManager()
	s1 := sm.Get(1)
	s2 := sm.Get(2)
	if s1 == s2 {
		t.Error("Get() returned same session for different userIDs")
	}
}

func TestStateManager_SetState(t *testing.T) {
	sm := NewStateManager()
	sm.SetState(1, StateWaitingAddText)
	session := sm.Get(1)
	if session.State != StateWaitingAddText {
		t.Errorf("State = %d, want StateWaitingAddText", session.State)
	}
}

func TestStateManager_Reset(t *testing.T) {
	sm := NewStateManager()
	session := sm.Get(1)
	session.State = StateWaitingEditText
	session.EditNoteID = 42
	session.PendingNoteText = "some text"
	session.AttachmentNoteID = 7
	// Поля окон вложений и последней заметки Reset не трогает
	session.AttachmentListMsgID = 111
	session.AttachmentViewMsgID = 222
	session.AttachmentViewType = model.AttachmentPhoto
	session.LastViewedNoteID = 5

	sm.Reset(1)

	session = sm.Get(1)
	if session.State != StateIdle {
		t.Errorf("State = %d, want StateIdle", session.State)
	}
	if session.EditNoteID != 0 {
		t.Errorf("EditNoteID = %d, want 0", session.EditNoteID)
	}
	if session.PendingNoteText != "" {
		t.Errorf("PendingNoteText = %q, want empty", session.PendingNoteText)
	}
	if session.AttachmentNoteID != 0 {
		t.Errorf("AttachmentNoteID = %d, want 0", session.AttachmentNoteID)
	}
	if session.AttachmentListMsgID != 111 {
		t.Errorf("AttachmentListMsgID = %d, want 111", session.AttachmentListMsgID)
	}
	if session.AttachmentViewMsgID != 222 {
		t.Errorf("AttachmentViewMsgID = %d, want 222", session.AttachmentViewMsgID)
	}
	if session.AttachmentViewType != model.AttachmentPhoto {
		t.Errorf("AttachmentViewType = %v, want photo", session.AttachmentViewType)
	}
	if session.LastViewedNoteID != 5 {
		t.Errorf("LastViewedNoteID = %d, want 5", session.LastViewedNoteID)
	}
}

func TestUserSession_DefaultValues(t *testing.T) {
	session := &UserSession{State: StateIdle}
	if session.CurrentTopicID != 0 {
		t.Errorf("CurrentTopicID = %d, want 0", session.CurrentTopicID)
	}
	if session.CurrentFolderID != nil {
		t.Errorf("CurrentFolderID = %v, want nil", session.CurrentFolderID)
	}
	if session.EditNoteID != 0 {
		t.Errorf("EditNoteID = %d, want 0", session.EditNoteID)
	}
}

func TestState_Values(t *testing.T) {
	// Проверяем, что значения состояний идут последовательно от 0
	if StateIdle != 0 {
		t.Errorf("StateIdle = %d, want 0", StateIdle)
	}
	if StateWaitingAddText != 1 {
		t.Errorf("StateWaitingAddText = %d, want 1", StateWaitingAddText)
	}
	if StateWaitingPriority != 2 {
		t.Errorf("StateWaitingPriority = %d, want 2", StateWaitingPriority)
	}
	if StateWaitingDeleteID != 3 {
		t.Errorf("StateWaitingDeleteID = %d, want 3", StateWaitingDeleteID)
	}
	if StateWaitingEditArgs != 4 {
		t.Errorf("StateWaitingEditArgs = %d, want 4", StateWaitingEditArgs)
	}
	if StateWaitingEditText != 5 {
		t.Errorf("StateWaitingEditText = %d, want 5", StateWaitingEditText)
	}
	if StateWaitingArchiveID != 6 {
		t.Errorf("StateWaitingArchiveID = %d, want 6", StateWaitingArchiveID)
	}
	if StateWaitingNewTopic != 7 {
		t.Errorf("StateWaitingNewTopic = %d, want 7", StateWaitingNewTopic)
	}
	if StateWaitingSetTopic != 8 {
		t.Errorf("StateWaitingSetTopic = %d, want 8", StateWaitingSetTopic)
	}
	if StateWaitingNewFolder != 9 {
		t.Errorf("StateWaitingNewFolder = %d, want 9", StateWaitingNewFolder)
	}
}

func TestStateManager_MultipleUsers(t *testing.T) {
	sm := NewStateManager()
	for i := int64(0); i < 100; i++ {
		sm.SetState(i, StateWaitingAddText)
		s := sm.Get(i)
		if s.State != StateWaitingAddText {
			t.Errorf("user %d: State = %d, want StateWaitingAddText", i, s.State)
		}
	}
}

func TestUserSession_ExpandedFoldersInitialized(t *testing.T) {
	// StateManager.Get инициализирует карту развёрнутых папок
	sm := NewStateManager()
	session := sm.Get(1)
	if session.ExpandedFolders == nil {
		t.Error("ExpandedFolders should be initialized by StateManager.Get")
	}
	if session.FoldersCollapsed {
		t.Error("FoldersCollapsed should default to false")
	}
}
