package todo

import (
	"os"
	"testing"
	"time"

	"todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/model"
	"todo-bot-tg/internal/repository/todo"
	"todo-bot-tg/internal/storage/fs"
)

func newTestService(t *testing.T) *Service {
	t.Helper()
	store := todo.NewMemStore()
	fileStore, err := fs.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("fs.NewStore() error: %v", err)
	}
	return NewService(store, store, store, store, store, fileStore)
}

// --- Topics ---

func TestService_CreateTopic(t *testing.T) {
	svc := newTestService(t)
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
	svc := newTestService(t)
	_, err := svc.CreateTopic(1, "")
	if err != errors.ErrEmptyName {
		t.Errorf("error = %v, want %v", err, errors.ErrEmptyName)
	}
}

func TestService_ListTopics(t *testing.T) {
	svc := newTestService(t)
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
	svc := newTestService(t)
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
	svc := newTestService(t)
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
	svc := newTestService(t)
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
	svc := newTestService(t)
	_, err := svc.AddNote(1, 0, nil, "", 0)
	if err != errors.ErrEmptyText {
		t.Errorf("error = %v, want %v", err, errors.ErrEmptyText)
	}
}

func TestService_ListNotes_SortByPriority(t *testing.T) {
	svc := newTestService(t)

	n1, _ := svc.AddNote(1, 0, nil, "Low", model.PriorityLow)       // должен быть последним
	n2, _ := svc.AddNote(1, 0, nil, "High", model.PriorityHigh)     // должен быть первым
	n3, _ := svc.AddNote(1, 0, nil, "None", model.PriorityNone)     // после Medium
	n4, _ := svc.AddNote(1, 0, nil, "Medium", model.PriorityMedium) // после High

	notes, err := svc.ListNotes(1, 0, nil)
	if err != nil {
		t.Fatalf("ListNotes() error: %v", err)
	}
	if len(notes) != 4 {
		t.Fatalf("len = %d, want 4", len(notes))
	}

	expected := []struct {
		id       int64
		priority model.Priority
	}{
		{n2.ID, model.PriorityHigh},   // 0: High
		{n4.ID, model.PriorityMedium}, // 1: Medium
		{n3.ID, model.PriorityNone},   // 2: None
		{n1.ID, model.PriorityLow},    // 3: Low
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
	svc := newTestService(t)

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
	svc := newTestService(t)
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
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "Before", 0)

	err := svc.EditNote(1, note.ID, "")
	if err != errors.ErrEmptyText {
		t.Errorf("error = %v, want %v", err, errors.ErrEmptyText)
	}
}

func TestService_DeleteNote(t *testing.T) {
	svc := newTestService(t)
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
	svc := newTestService(t)
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
	svc := newTestService(t)
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
	svc := newTestService(t)
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
	svc := newTestService(t)
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

func TestService_PinNote(t *testing.T) {
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "Test", 0)

	err := svc.PinNote(1, note.ID)
	if err != nil {
		t.Fatalf("PinNote() error: %v", err)
	}

	got, _ := svc.GetNote(1, note.ID)
	if !got.Pinned {
		t.Error("PinNote() did not set Pinned to true")
	}
}

func TestService_UnpinNote(t *testing.T) {
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "Test", 0)
	_ = svc.PinNote(1, note.ID)

	err := svc.UnpinNote(1, note.ID)
	if err != nil {
		t.Fatalf("UnpinNote() error: %v", err)
	}

	got, _ := svc.GetNote(1, note.ID)
	if got.Pinned {
		t.Error("UnpinNote() did not set Pinned to false")
	}
}

func TestService_ListNotes_PinnedFirst(t *testing.T) {
	svc := newTestService(t)

	// High-приоритетная, но не закреплённая — должна идти после закреплённого Low
	n1, _ := svc.AddNote(1, 0, nil, "High unpinned", model.PriorityHigh)
	n2, _ := svc.AddNote(1, 0, nil, "Low pinned", model.PriorityLow)
	_ = svc.PinNote(1, n2.ID)

	notes, err := svc.ListNotes(1, 0, nil)
	if err != nil {
		t.Fatalf("ListNotes() error: %v", err)
	}
	if len(notes) != 2 {
		t.Fatalf("len = %d, want 2", len(notes))
	}

	// Закреплённая — первая, несмотря на более низкий приоритет
	if notes[0].ID != n2.ID || !notes[0].Pinned {
		t.Errorf("notes[0] should be the pinned note")
	}
	if notes[1].ID != n1.ID || notes[1].Pinned {
		t.Errorf("notes[1] should be the unpinned note")
	}
}

func TestService_ListNotes_PinnedDoneStaysFirst(t *testing.T) {
	svc := newTestService(t)

	n1, _ := svc.AddNote(1, 0, nil, "Active", model.PriorityNone)
	n2, _ := svc.AddNote(1, 0, nil, "Done pinned", model.PriorityNone)
	_ = svc.PinNote(1, n2.ID)
	_ = svc.MarkDone(1, n2.ID)

	notes, err := svc.ListNotes(1, 0, nil)
	if err != nil {
		t.Fatalf("ListNotes() error: %v", err)
	}
	if len(notes) != 2 {
		t.Fatalf("len = %d, want 2", len(notes))
	}

	// Закреплённая заметка всегда вверху — даже если выполнена
	if notes[0].ID != n2.ID || !notes[0].Pinned {
		t.Errorf("notes[0] should be the pinned done note")
	}
	if notes[1].ID != n1.ID || notes[1].Pinned {
		t.Errorf("notes[1] should be the active note")
	}
}

func TestService_SetPriority(t *testing.T) {
	svc := newTestService(t)
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
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "Test", 0)

	at := time.Date(2026, 8, 6, 15, 0, 0, 0, time.UTC)
	err := svc.SetReminder(1, note.ID, at, model.ReminderRepeatOnce)
	if err != nil {
		t.Fatalf("SetReminder() error: %v", err)
	}

	got, _ := svc.GetNote(1, note.ID)
	if got.ReminderAt == nil || !got.ReminderAt.Equal(at) {
		t.Errorf("ReminderAt = %v, want %v", got.ReminderAt, at)
	}
}

func TestService_ClearReminder(t *testing.T) {
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "Test", 0)
	_ = svc.SetReminder(1, note.ID, time.Now(), model.ReminderRepeatOnce)

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
	svc := newTestService(t)
	past := time.Now().Add(-1 * time.Hour)
	_, _ = svc.AddNote(1, 0, nil, "Past", 0)
	note2, _ := svc.AddNote(1, 1, nil, "Past 2", 0)
	_ = svc.SetReminder(1, note2.ID, past, model.ReminderRepeatOnce)

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

func TestService_ListTimers(t *testing.T) {
	svc := newTestService(t)

	// Заметки пользователя 1 в разных топиках
	n1, _ := svc.AddNote(1, 1, nil, "Ранний таймер", 0)
	n2, _ := svc.AddNote(1, 2, nil, "Поздний таймер", 0)
	_, _ = svc.AddNote(1, 1, nil, "Без таймера", 0)

	early := time.Date(2026, 8, 6, 9, 0, 0, 0, time.UTC)
	late := time.Date(2026, 8, 6, 18, 0, 0, 0, time.UTC)
	if err := svc.SetReminder(1, n1.ID, early, model.ReminderRepeatOnce); err != nil {
		t.Fatalf("SetReminder() error: %v", err)
	}
	if err := svc.SetReminder(1, n2.ID, late, model.ReminderRepeatDaily); err != nil {
		t.Fatalf("SetReminder() error: %v", err)
	}

	notes, err := svc.ListTimers(1)
	if err != nil {
		t.Fatalf("ListTimers() error: %v", err)
	}
	if len(notes) != 2 {
		t.Fatalf("len = %d, want 2", len(notes))
	}
	// Сортировка по времени таймера
	if notes[0].ID != n1.ID || notes[1].ID != n2.ID {
		t.Errorf("order = [%d, %d], want [%d, %d]", notes[0].ID, notes[1].ID, n1.ID, n2.ID)
	}
	if notes[1].ReminderRepeat != model.ReminderRepeatDaily {
		t.Errorf("ReminderRepeat = %q, want %q", notes[1].ReminderRepeat, model.ReminderRepeatDaily)
	}
}

func TestService_ListTimers_OtherUser(t *testing.T) {
	svc := newTestService(t)

	note, _ := svc.AddNote(2, 1, nil, "Чужой таймер", 0)
	_ = svc.SetReminder(2, note.ID, time.Now(), model.ReminderRepeatOnce)

	notes, err := svc.ListTimers(1)
	if err != nil {
		t.Fatalf("ListTimers() error: %v", err)
	}
	if len(notes) != 0 {
		t.Errorf("len = %d, want 0", len(notes))
	}
}

func TestService_CountNotes(t *testing.T) {
	svc := newTestService(t)
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
	svc := newTestService(t)
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
	svc := newTestService(t)
	if svc.HasAnyData(1) {
		t.Error("HasAnyData() = true for empty user")
	}

	_, _ = svc.CreateTopic(1, "Test")
	if !svc.HasAnyData(1) {
		t.Error("HasAnyData() = false after creating topic")
	}
}

func TestService_SeedDefaults(t *testing.T) {
	svc := newTestService(t)
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
	svc := newTestService(t)
	folder, err := svc.CreateFolder(1, 1, nil, "Моя папка")
	if err != nil {
		t.Fatalf("CreateFolder() error: %v", err)
	}
	if folder.ID == 0 {
		t.Error("CreateFolder() returned zero ID")
	}
}

func TestService_CreateFolder_EmptyName(t *testing.T) {
	svc := newTestService(t)
	_, err := svc.CreateFolder(1, 1, nil, "")
	if err != errors.ErrEmptyFolderName {
		t.Errorf("error = %v, want %v", err, errors.ErrEmptyFolderName)
	}
}

func TestService_ListFolders(t *testing.T) {
	svc := newTestService(t)
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
	svc := newTestService(t)
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
	svc := newTestService(t)
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
	svc := newTestService(t)
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

// --- Attachments ---

func TestService_AddAttachment(t *testing.T) {
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "С заметкой", 0)

	att, err := svc.AddAttachment(1, note.ID, model.AttachmentPhoto, "file_id_1", "photo.jpg", "image/jpeg", 1024, []byte("data"))
	if err != nil {
		t.Fatalf("AddAttachment() error: %v", err)
	}
	if att.ID == 0 {
		t.Error("AddAttachment() returned zero ID")
	}
	if att.NoteID != note.ID {
		t.Errorf("NoteID = %d, want %d", att.NoteID, note.ID)
	}
	if att.UserID != 1 {
		t.Errorf("UserID = %d, want 1", att.UserID)
	}
	if att.FilePath == "" {
		t.Error("FilePath is empty")
	}
	if att.FileID != "file_id_1" {
		t.Errorf("FileID = %q, want file_id_1", att.FileID)
	}

	// Файл должен лежать на диске
	if svc.fileStore.AbsPath(att.FilePath) == "" {
		t.Errorf("AbsPath(%q) is empty", att.FilePath)
	}
}

func TestService_AddAttachment_NoteNotFound(t *testing.T) {
	svc := newTestService(t)
	_, err := svc.AddAttachment(1, 999, model.AttachmentPhoto, "fid", "a.jpg", "image/jpeg", 1, []byte("x"))
	if err != errors.ErrNoteNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrNoteNotFound)
	}
}

func TestService_AddAttachment_InvalidType(t *testing.T) {
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "N", 0)
	_, err := svc.AddAttachment(1, note.ID, "gif", "fid", "a.gif", "image/gif", 1, []byte("x"))
	if err != errors.ErrInvalidAttachmentType {
		t.Errorf("error = %v, want %v", err, errors.ErrInvalidAttachmentType)
	}
}

func TestService_AddAttachment_EmptyData(t *testing.T) {
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "N", 0)
	_, err := svc.AddAttachment(1, note.ID, model.AttachmentDocument, "fid", "a.txt", "text/plain", 0, nil)
	if err != errors.ErrEmptyFile {
		t.Errorf("error = %v, want %v", err, errors.ErrEmptyFile)
	}
}

func TestService_AddAttachment_DuplicateFileName(t *testing.T) {
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "N", 0)

	first, _ := svc.AddAttachment(1, note.ID, model.AttachmentPhoto, "f1", "photo.jpg", "image/jpeg", 100, []byte("a"))
	second, _ := svc.AddAttachment(1, note.ID, model.AttachmentPhoto, "f2", "photo.jpg", "image/jpeg", 100, []byte("b"))
	third, _ := svc.AddAttachment(1, note.ID, model.AttachmentPhoto, "f3", "photo.jpg", "image/jpeg", 100, []byte("c"))

	if first.FileName != "photo.jpg" {
		t.Errorf("first FileName = %q, want photo.jpg", first.FileName)
	}
	if second.FileName != "photo (2).jpg" {
		t.Errorf("second FileName = %q, want photo (2).jpg", second.FileName)
	}
	if third.FileName != "photo (3).jpg" {
		t.Errorf("third FileName = %q, want photo (3).jpg", third.FileName)
	}
}

func TestService_AddAttachment_DuplicateFileName_NoExt(t *testing.T) {
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "N", 0)

	first, _ := svc.AddAttachment(1, note.ID, model.AttachmentDocument, "f1", "notes", "application/octet-stream", 10, []byte("a"))
	second, _ := svc.AddAttachment(1, note.ID, model.AttachmentDocument, "f2", "notes", "application/octet-stream", 10, []byte("b"))

	if first.FileName != "notes" {
		t.Errorf("first FileName = %q, want notes", first.FileName)
	}
	if second.FileName != "notes (2)" {
		t.Errorf("second FileName = %q, want notes (2)", second.FileName)
	}
}

func TestService_AddAttachment_SameNameDifferentNote(t *testing.T) {
	svc := newTestService(t)
	note1, _ := svc.AddNote(1, 0, nil, "N1", 0)
	note2, _ := svc.AddNote(1, 0, nil, "N2", 0)

	a1, _ := svc.AddAttachment(1, note1.ID, model.AttachmentDocument, "f1", "same.pdf", "application/pdf", 10, []byte("a"))
	a2, _ := svc.AddAttachment(1, note2.ID, model.AttachmentDocument, "f2", "same.pdf", "application/pdf", 10, []byte("b"))

	// Разные заметки — постфикс не нужен
	if a1.FileName != "same.pdf" || a2.FileName != "same.pdf" {
		t.Errorf("FileNames = %q, %q, want both same.pdf", a1.FileName, a2.FileName)
	}
}

func TestUniqueFileName(t *testing.T) {
	used := map[string]bool{"file.txt": true, "file (2).txt": true}
	if got := uniqueFileName("file.txt", used); got != "file (3).txt" {
		t.Errorf("uniqueFileName(file.txt) = %q, want file (3).txt", got)
	}
	if got := uniqueFileName("new.txt", used); got != "new.txt" {
		t.Errorf("uniqueFileName(new.txt) = %q, want new.txt", got)
	}
	if got := uniqueFileName("file", map[string]bool{"file": true}); got != "file (2)" {
		t.Errorf("uniqueFileName(file) = %q, want file (2)", got)
	}
	if got := uniqueFileName("", map[string]bool{"": true}); got != " (2)" {
		t.Errorf("uniqueFileName(empty) = %q, want  (2)", got)
	}
}

func TestService_ListAttachments(t *testing.T) {
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "N", 0)
	_, _ = svc.AddAttachment(1, note.ID, model.AttachmentDocument, "f1", "a.pdf", "application/pdf", 100, []byte("pdf"))
	_, _ = svc.AddAttachment(1, note.ID, model.AttachmentPhoto, "f2", "b.png", "image/png", 200, []byte("png"))

	atts, err := svc.ListAttachments(1, note.ID)
	if err != nil {
		t.Fatalf("ListAttachments() error: %v", err)
	}
	if len(atts) != 2 {
		t.Errorf("len = %d, want 2", len(atts))
	}
}

func TestService_ListAttachments_OtherUser(t *testing.T) {
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "N", 0)
	_, _ = svc.AddAttachment(1, note.ID, model.AttachmentPhoto, "f1", "a.jpg", "image/jpeg", 1, []byte("x"))

	_, err := svc.ListAttachments(2, note.ID)
	if err != errors.ErrNoteNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrNoteNotFound)
	}
}

func TestService_GetAttachment(t *testing.T) {
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "N", 0)
	created, _ := svc.AddAttachment(1, note.ID, model.AttachmentPhoto, "f1", "a.jpg", "image/jpeg", 1, []byte("x"))

	got, err := svc.GetAttachment(1, created.ID)
	if err != nil {
		t.Fatalf("GetAttachment() error: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("ID = %d, want %d", got.ID, created.ID)
	}
}

func TestService_GetAttachment_OtherUser(t *testing.T) {
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "N", 0)
	created, _ := svc.AddAttachment(1, note.ID, model.AttachmentPhoto, "f1", "a.jpg", "image/jpeg", 1, []byte("x"))

	_, err := svc.GetAttachment(2, created.ID)
	if err != errors.ErrAttachmentNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrAttachmentNotFound)
	}
}

func TestService_DeleteAttachment(t *testing.T) {
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "N", 0)
	created, _ := svc.AddAttachment(1, note.ID, model.AttachmentPhoto, "f1", "a.jpg", "image/jpeg", 1, []byte("x"))

	// Файл существует до удаления
	if svc.fileStore.AbsPath(created.FilePath) == "" {
		t.Fatal("file not saved before delete")
	}

	err := svc.DeleteAttachment(1, created.ID)
	if err != nil {
		t.Fatalf("DeleteAttachment() error: %v", err)
	}

	_, err = svc.GetAttachment(1, created.ID)
	if err != errors.ErrAttachmentNotFound {
		t.Errorf("attachment still exists after delete")
	}
	// Файл удалён с диска
	if _, statErr := os.Stat(svc.fileStore.AbsPath(created.FilePath)); statErr == nil {
		t.Error("file still on disk after delete")
	}
}

func TestService_DeleteAttachment_OtherUser(t *testing.T) {
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "N", 0)
	created, _ := svc.AddAttachment(1, note.ID, model.AttachmentPhoto, "f1", "a.jpg", "image/jpeg", 1, []byte("x"))

	err := svc.DeleteAttachment(2, created.ID)
	if err != errors.ErrAttachmentNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrAttachmentNotFound)
	}
	// Вложение должно остаться
	if _, err := svc.GetAttachment(1, created.ID); err != nil {
		t.Error("attachment deleted by other user")
	}
}

func TestService_DeleteNote_RemovesFiles(t *testing.T) {
	svc := newTestService(t)
	note, _ := svc.AddNote(1, 0, nil, "N", 0)
	att, _ := svc.AddAttachment(1, note.ID, model.AttachmentDocument, "f1", "a.pdf", "application/pdf", 100, []byte("pdf"))
	att2, _ := svc.AddAttachment(1, note.ID, model.AttachmentPhoto, "f2", "b.jpg", "image/jpeg", 200, []byte("jpg"))

	err := svc.DeleteNote(1, note.ID)
	if err != nil {
		t.Fatalf("DeleteNote() error: %v", err)
	}

	if _, statErr := os.Stat(svc.fileStore.AbsPath(att.FilePath)); statErr == nil {
		t.Error("file 1 still on disk after note delete")
	}
	if _, statErr := os.Stat(svc.fileStore.AbsPath(att2.FilePath)); statErr == nil {
		t.Error("file 2 still on disk after note delete")
	}
}

func TestService_DeleteTopic_RemovesFiles(t *testing.T) {
	svc := newTestService(t)
	topic, _ := svc.CreateTopic(1, "T")
	note, _ := svc.AddNote(1, topic.ID, nil, "N", 0)
	att, _ := svc.AddAttachment(1, note.ID, model.AttachmentDocument, "f1", "a.pdf", "application/pdf", 100, []byte("pdf"))

	err := svc.DeleteTopic(1, topic.ID)
	if err != nil {
		t.Fatalf("DeleteTopic() error: %v", err)
	}

	if _, statErr := os.Stat(svc.fileStore.AbsPath(att.FilePath)); statErr == nil {
		t.Error("file still on disk after topic delete")
	}
}

// --- Settings ---

func TestService_GetSettings_Defaults(t *testing.T) {
	svc := newTestService(t)

	settings, err := svc.GetSettings(1)
	if err != nil {
		t.Fatalf("GetSettings() error: %v", err)
	}
	if settings.UserID != 1 {
		t.Errorf("UserID = %d, want 1", settings.UserID)
	}
	if settings.ShowCounts || settings.BreadcrumbInline || settings.BreadcrumbBottom ||
		settings.ShowKeyboard || settings.FoldersCollapsed {
		t.Error("default settings must be zero values")
	}
	if settings.TimezoneOffset != 0 {
		t.Errorf("TimezoneOffset = %d, want 0", settings.TimezoneOffset)
	}
}

func TestService_SaveAndGetSettings(t *testing.T) {
	svc := newTestService(t)

	settings := model.UserSettings{
		UserID:           7,
		ShowCounts:       true,
		BreadcrumbInline: true,
		BreadcrumbBottom: true,
		ShowKeyboard:     true,
		TimezoneOffset:   4,
		FoldersCollapsed: true,
	}
	if err := svc.SaveSettings(settings); err != nil {
		t.Fatalf("SaveSettings() error: %v", err)
	}

	got, err := svc.GetSettings(7)
	if err != nil {
		t.Fatalf("GetSettings() error: %v", err)
	}
	if got != settings {
		t.Errorf("settings = %+v, want %+v", got, settings)
	}
}

func TestService_Settings_IsolatedPerUser(t *testing.T) {
	svc := newTestService(t)

	if err := svc.SaveSettings(model.UserSettings{UserID: 1, ShowCounts: true}); err != nil {
		t.Fatalf("SaveSettings() error: %v", err)
	}

	// Другой пользователь должен получить дефолты, а не чужие настройки
	settings, err := svc.GetSettings(2)
	if err != nil {
		t.Fatalf("GetSettings() error: %v", err)
	}
	if settings.ShowCounts {
		t.Error("settings leaked between users")
	}
}

func TestService_SaveSettings_Overwrite(t *testing.T) {
	svc := newTestService(t)

	_ = svc.SaveSettings(model.UserSettings{UserID: 1, ShowCounts: true, TimezoneOffset: 5})
	_ = svc.SaveSettings(model.UserSettings{UserID: 1, ShowCounts: false, TimezoneOffset: 2})

	got, err := svc.GetSettings(1)
	if err != nil {
		t.Fatalf("GetSettings() error: %v", err)
	}
	if got.ShowCounts {
		t.Error("ShowCounts = true, want false after overwrite")
	}
	if got.TimezoneOffset != 2 {
		t.Errorf("TimezoneOffset = %d, want 2", got.TimezoneOffset)
	}
}
