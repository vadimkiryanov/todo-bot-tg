package todo

import (
	"testing"
	"time"

	"todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/model"
	"todo-bot-tg/internal/repository/todo"
)

func newTestService() *Service {
	store := todo.NewMemStore()
	return NewService(store, store, store)
}

// --- Topics ---

func TestService_CreateTopic(t *testing.T) {
	svc := newTestService()
	topic, err := svc.CreateTopic(1, "🏠 Личное")
	if err != nil {
		t.Fatalf("CreateTopic() error: %v", err)
	}
	if topic.ID == 0 {
		t.Error("CreateTopic() returned zero ID")
	}
	if topic.Name != "🏠 Личное" {
		t.Errorf("Name = %q, want %q", topic.Name, "🏠 Личное")
	}
}

func TestService_CreateTopic_EmptyName(t *testing.T) {
	svc := newTestService()
	_, err := svc.CreateTopic(1, "")
	if err != errors.ErrEmptyName {
		t.Errorf("error = %v, want %v", err, errors.ErrEmptyName)
	}
}

func TestService_ListTopics(t *testing.T) {
	svc := newTestService()
	_, _ = svc.CreateTopic(1, "A")
	_, _ = svc.CreateTopic(1, "B")

	topics, err := svc.ListTopics(1)
	if err != nil {
		t.Fatalf("ListTopics() error: %v", err)
	}
	if len(topics) != 2 {
		t.Errorf("len = %d, want 2", len(topics))
	}
}

func TestService_GetTopic(t *testing.T) {
	svc := newTestService()
	created, _ := svc.CreateTopic(1, "Test")
	got, err := svc.GetTopic(1, created.ID)
	if err != nil {
		t.Fatalf("GetTopic() error: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("ID = %d, want %d", got.ID, created.ID)
	}
}

func TestService_DeleteTopic(t *testing.T) {
	svc := newTestService()
	topic, _ := svc.CreateTopic(1, "Test")
	_, _ = svc.AddNote(1, topic.ID, nil, "Note", 0)

	err := svc.DeleteTopic(1, topic.ID)
	if err != nil {
		t.Fatalf("DeleteTopic() error: %v", err)
	}

	notes, _ := svc.ListNotes(1, topic.ID, nil)
	if len(notes) != 0 {
		t.Errorf("notes after topic delete: len = %d, want 0", len(notes))
	}
}

// --- Notes ---

func TestService_AddNote(t *testing.T) {
	svc := newTestService()
	note, err := svc.AddNote(1, 0, nil, "Купить хлеб", model.PriorityHigh)
	if err != nil {
		t.Fatalf("AddNote() error: %v", err)
	}
	if note.ID == 0 {
		t.Error("AddNote() returned zero ID")
	}
	if note.Priority != model.PriorityHigh {
		t.Errorf("Priority = %d, want %d", note.Priority, model.PriorityHigh)
	}
}

func TestService_AddNote_EmptyText(t *testing.T) {
	svc := newTestService()
	_, err := svc.AddNote(1, 0, nil, "", 0)
	if err != errors.ErrEmptyText {
		t.Errorf("error = %v, want %v", err, errors.ErrEmptyText)
	}
}

func TestService_ListNotes_SortByPriority(t *testing.T) {
	svc := newTestService()

	n1, _ := svc.AddNote(1, 0, nil, "Low", model.PriorityLow)       // должен быть последним
	n2, _ := svc.AddNote(1, 0, nil, "High", model.PriorityHigh)      // должен быть первым
	n3, _ := svc.AddNote(1, 0, nil, "None", model.PriorityNone)      // после Medium
	n4, _ := svc.AddNote(1, 0, nil, "Medium", model.PriorityMedium)  // после High

	notes, err := svc.ListNotes(1, 0, nil)
	if err != nil {
		t.Fatalf("ListNotes() error: %v", err)
	}
	if len(notes) != 4 {
		t.Fatalf("len = %d, want 4", len(notes))
	}

	expected := []struct {
		id       int64
		priority int
	}{
		{n2.ID, model.PriorityHigh},    // 0: High
		{n4.ID, model.PriorityMedium},  // 1: Medium
		{n3.ID, model.PriorityNone},    // 2: None
		{n1.ID, model.PriorityLow},     // 3: Low
	}

	for i, exp := range expected {
		if notes[i].ID != exp.id {
			t.Errorf("notes[%d].ID = %d, want %d (priority order wrong)", i, notes[i].ID, exp.id)
		}
		if notes[i].Priority != exp.priority {
			t.Errorf("notes[%d].Priority = %d, want %d", i, notes[i].Priority, exp.priority)
		}
	}
}

func TestService_ListNotes_DoneGoesToEnd(t *testing.T) {
	svc := newTestService()

	n1, _ := svc.AddNote(1, 0, nil, "Active High", model.PriorityHigh)
	n2, _ := svc.AddNote(1, 0, nil, "Active Low", model.PriorityLow)
	n3, _ := svc.AddNote(1, 0, nil, "Done High", model.PriorityHigh)
	n4, _ := svc.AddNote(1, 0, nil, "Done None", model.PriorityNone)

	// Помечаем n3 и n4 как выполненные
	_ = svc.MarkDone(1, n3.ID)
	_ = svc.MarkDone(1, n4.ID)

	notes, err := svc.ListNotes(1, 0, nil)
	if err != nil {
		t.Fatalf("ListNotes() error: %v", err)
	}
	if len(notes) != 4 {
		t.Fatalf("len = %d, want 4", len(notes))
	}

	// Первые два — активные (High, Low)
	if notes[0].ID != n1.ID || notes[0].Done {
		t.Errorf("notes[0] should be active High")
	}
	if notes[1].ID != n2.ID || notes[1].Done {
		t.Errorf("notes[1] should be active Low")
	}
	// Последние два — выполненные
	if notes[2].ID != n3.ID || !notes[2].Done {
		t.Errorf("notes[2] should be done High")
	}
	if notes[3].ID != n4.ID || !notes[3].Done {
		t.Errorf("notes[3] should be done None")
	}
}

func TestService_EditNote(t *testing.T) {
	svc := newTestService()
	note, _ := svc.AddNote(1, 0, nil, "Before", 0)

	err := svc.EditNote(1, note.ID, "After")
	if err != nil {
		t.Fatalf("EditNote() error: %v", err)
	}

	got, _ := svc.GetNote(1, note.ID)
	if got.Text != "After" {
		t.Errorf("Text = %q, want %q", got.Text, "After")
	}
}

func TestService_EditNote_EmptyText(t *testing.T) {
	svc := newTestService()
	note, _ := svc.AddNote(1, 0, nil, "Before", 0)

	err := svc.EditNote(1, note.ID, "")
	if err != errors.ErrEmptyText {
		t.Errorf("error = %v, want %v", err, errors.ErrEmptyText)
	}
}

func TestService_DeleteNote(t *testing.T) {
	svc := newTestService()
	note, _ := svc.AddNote(1, 0, nil, "Test", 0)

	err := svc.DeleteNote(1, note.ID)
	if err != nil {
		t.Fatalf("DeleteNote() error: %v", err)
	}

	_, err = svc.GetNote(1, note.ID)
	if err != errors.ErrNoteNotFound {
		t.Errorf("note still exists after delete")
	}
}

func TestService_ArchiveNote(t *testing.T) {
	svc := newTestService()
	note, _ := svc.AddNote(1, 0, nil, "Test", 0)

	err := svc.ArchiveNote(1, note.ID)
	if err != nil {
		t.Fatalf("ArchiveNote() error: %v", err)
	}

	got, _ := svc.GetNote(1, note.ID)
	if !got.Archived {
		t.Error("note not archived")
	}
}

func TestService_UnarchiveNote(t *testing.T) {
	svc := newTestService()
	note, _ := svc.AddNote(1, 0, nil, "Test", 0)
	_ = svc.ArchiveNote(1, note.ID)

	err := svc.UnarchiveNote(1, note.ID)
	if err != nil {
		t.Fatalf("UnarchiveNote() error: %v", err)
	}

	got, _ := svc.GetNote(1, note.ID)
	if got.Archived {
		t.Error("note still archived")
	}
}

func TestService_MarkDone(t *testing.T) {
	svc := newTestService()
	note, _ := svc.AddNote(1, 0, nil, "Test", 0)

	err := svc.MarkDone(1, note.ID)
	if err != nil {
		t.Fatalf("MarkDone() error: %v", err)
	}

	got, _ := svc.GetNote(1, note.ID)
	if !got.Done {
		t.Error("MarkDone() did not set Done to true")
	}
}

func TestService_MarkUndone(t *testing.T) {
	svc := newTestService()
	note, _ := svc.AddNote(1, 0, nil, "Test", 0)
	_ = svc.MarkDone(1, note.ID)

	err := svc.MarkUndone(1, note.ID)
	if err != nil {
		t.Fatalf("MarkUndone() error: %v", err)
	}

	got, _ := svc.GetNote(1, note.ID)
	if got.Done {
		t.Error("MarkUndone() did not set Done to false")
	}
}

func TestService_SetPriority(t *testing.T) {
	svc := newTestService()
	note, _ := svc.AddNote(1, 0, nil, "Test", model.PriorityNone)

	err := svc.SetPriority(1, note.ID, model.PriorityHigh)
	if err != nil {
		t.Fatalf("SetPriority() error: %v", err)
	}

	got, _ := svc.GetNote(1, note.ID)
	if got.Priority != model.PriorityHigh {
		t.Errorf("Priority = %d, want %d", got.Priority, model.PriorityHigh)
	}
}

func TestService_SetReminder(t *testing.T) {
	svc := newTestService()
	note, _ := svc.AddNote(1, 0, nil, "Test", 0)

	at := time.Date(2026, 8, 6, 15, 0, 0, 0, time.UTC)
	err := svc.SetReminder(1, note.ID, at)
	if err != nil {
		t.Fatalf("SetReminder() error: %v", err)
	}

	got, _ := svc.GetNote(1, note.ID)
	if got.ReminderAt == nil || !got.ReminderAt.Equal(at) {
		t.Errorf("ReminderAt = %v, want %v", got.ReminderAt, at)
	}
}

func TestService_ClearReminder(t *testing.T) {
	svc := newTestService()
	note, _ := svc.AddNote(1, 0, nil, "Test", 0)
	_ = svc.SetReminder(1, note.ID, time.Now())

	err := svc.ClearReminder(1, note.ID)
	if err != nil {
		t.Fatalf("ClearReminder() error: %v", err)
	}

	got, _ := svc.GetNote(1, note.ID)
	if got.ReminderAt != nil {
		t.Error("ReminderAt not cleared")
	}
}

func TestService_ProcessPendingReminders(t *testing.T) {
	svc := newTestService()
	past := time.Now().Add(-1 * time.Hour)
	_, _ = svc.AddNote(1, 0, nil, "Past", 0)
	note2, _ := svc.AddNote(1, 1, nil, "Past 2", 0)
	_ = svc.SetReminder(1, note2.ID, past)

	notes, err := svc.ProcessPendingReminders()
	if err != nil {
		t.Fatalf("ProcessPendingReminders() error: %v", err)
	}
	if len(notes) != 1 {
		t.Errorf("len = %d, want 1", len(notes))
	}

	// Напоминание должно сброситься
	got, _ := svc.GetNote(1, note2.ID)
	if got.ReminderAt != nil {
		t.Error("ReminderAt not cleared after processing")
	}
}

func TestService_CountNotes(t *testing.T) {
	svc := newTestService()
	_, _ = svc.AddNote(1, 1, nil, "A", 0)
	_, _ = svc.AddNote(1, 1, nil, "B", 0)
	_, _ = svc.AddNote(1, 2, nil, "C", 0)

	count, err := svc.CountNotes(1, 1, nil)
	if err != nil {
		t.Fatalf("CountNotes() error: %v", err)
	}
	if count != 2 {
		t.Errorf("count = %d, want 2", count)
	}
}

func TestService_ListArchived(t *testing.T) {
	svc := newTestService()
	note, _ := svc.AddNote(1, 0, nil, "Test", 0)
	_ = svc.ArchiveNote(1, note.ID)

	list, err := svc.ListArchived(1)
	if err != nil {
		t.Fatalf("ListArchived() error: %v", err)
	}
	if len(list) != 1 {
		t.Errorf("len = %d, want 1", len(list))
	}
}

func TestService_HasAnyData(t *testing.T) {
	svc := newTestService()
	if svc.HasAnyData(1) {
		t.Error("HasAnyData() = true for empty user")
	}

	_, _ = svc.CreateTopic(1, "Test")
	if !svc.HasAnyData(1) {
		t.Error("HasAnyData() = false after creating topic")
	}
}

func TestService_SeedDefaults(t *testing.T) {
	svc := newTestService()
	err := svc.SeedDefaults(1)
	if err != nil {
		t.Fatalf("SeedDefaults() error: %v", err)
	}

	topics, _ := svc.ListTopics(1)
	if len(topics) != 2 {
		t.Errorf("len(topics) = %d, want 2", len(topics))
	}

	notes, _ := svc.ListNotes(1, 0, nil)
	if len(notes) != 5 {
		t.Errorf("len(notes) = %d, want 5", len(notes))
	}

	// Повторный вызов не должен дублировать
	err = svc.SeedDefaults(1)
	if err != nil {
		t.Fatalf("SeedDefaults() second call error: %v", err)
	}
	topics2, _ := svc.ListTopics(1)
	if len(topics2) != 2 {
		t.Errorf("SeedDefaults duplicated topics: len = %d, want 2", len(topics2))
	}
}

// --- Folders ---

func TestService_CreateFolder(t *testing.T) {
	svc := newTestService()
	folder, err := svc.CreateFolder(1, 1, nil, "Моя папка")
	if err != nil {
		t.Fatalf("CreateFolder() error: %v", err)
	}
	if folder.ID == 0 {
		t.Error("CreateFolder() returned zero ID")
	}
}

func TestService_CreateFolder_EmptyName(t *testing.T) {
	svc := newTestService()
	_, err := svc.CreateFolder(1, 1, nil, "")
	if err != errors.ErrEmptyFolderName {
		t.Errorf("error = %v, want %v", err, errors.ErrEmptyFolderName)
	}
}

func TestService_ListFolders(t *testing.T) {
	svc := newTestService()
	_, _ = svc.CreateFolder(1, 1, nil, "F1")
	_, _ = svc.CreateFolder(1, 1, nil, "F2")

	folders, err := svc.ListFolders(1, 1, nil)
	if err != nil {
		t.Fatalf("ListFolders() error: %v", err)
	}
	if len(folders) != 2 {
		t.Errorf("len = %d, want 2", len(folders))
	}
}

func TestService_GetFolder(t *testing.T) {
	svc := newTestService()
	created, _ := svc.CreateFolder(1, 1, nil, "Test")
	got, err := svc.GetFolder(1, created.ID)
	if err != nil {
		t.Fatalf("GetFolder() error: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("ID = %d, want %d", got.ID, created.ID)
	}
}

func TestService_GetFolderChain(t *testing.T) {
	svc := newTestService()
	root, _ := svc.CreateFolder(1, 1, nil, "Root")
	child, _ := svc.CreateFolder(1, 1, &root.ID, "Child")

	chain, err := svc.GetFolderChain(child.ID)
	if err != nil {
		t.Fatalf("GetFolderChain() error: %v", err)
	}
	if len(chain) != 2 {
		t.Errorf("len = %d, want 2", len(chain))
	}
	if chain[0].Name != "Root" {
		t.Errorf("chain[0] = %q, want Root", chain[0].Name)
	}
	if chain[1].Name != "Child" {
		t.Errorf("chain[1] = %q, want Child", chain[1].Name)
	}
}

func TestService_MoveNote(t *testing.T) {
	svc := newTestService()
	note, _ := svc.AddNote(1, 1, nil, "Test", 0)
	folder, _ := svc.CreateFolder(1, 2, nil, "Target")

	err := svc.MoveNote(1, note.ID, 2, &folder.ID)
	if err != nil {
		t.Fatalf("MoveNote() error: %v", err)
	}

	got, _ := svc.GetNote(1, note.ID)
	if got.TopicID != 2 {
		t.Errorf("TopicID = %d, want 2", got.TopicID)
	}
	if got.FolderID == nil || *got.FolderID != folder.ID {
		t.Errorf("FolderID = %v, want %d", got.FolderID, folder.ID)
	}
}
