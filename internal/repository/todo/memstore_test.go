package todo

import (
	"testing"
	"time"

	"todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/model"
)

func newTestStore() *MemStore {
	return NewMemStore()
}

// --- Topics ---

func TestMemStore_CreateTopic(t *testing.T) {
	s := newTestStore()
	topic, err := s.CreateTopic(1, "🏠 Личное")
	if err != nil {
		t.Fatalf("CreateTopic() unexpected error: %v", err)
	}
	if topic.ID == 0 {
		t.Error("CreateTopic() returned zero ID")
	}
	if topic.Name != "🏠 Личное" {
		t.Errorf("Name = %q, want %q", topic.Name, "🏠 Личное")
	}
}

func TestMemStore_CreateTopic_Duplicate(t *testing.T) {
	s := newTestStore()
	_, _ = s.CreateTopic(1, "🏠 Личное")
	_, err := s.CreateTopic(1, "🏠 Личное")
	if err != errors.ErrTopicAlreadyExists {
		t.Errorf("error = %v, want %v", err, errors.ErrTopicAlreadyExists)
	}
}

func TestMemStore_CreateTopic_SameNameDiffUsers(t *testing.T) {
	s := newTestStore()
	_, err1 := s.CreateTopic(1, "Работа")
	_, err2 := s.CreateTopic(2, "Работа")
	if err1 != nil {
		t.Errorf("CreateTopic(user=1): %v", err1)
	}
	if err2 != nil {
		t.Errorf("CreateTopic(user=2): %v", err2)
	}
}

func TestMemStore_ListTopics(t *testing.T) {
	s := newTestStore()
	_, _ = s.CreateTopic(1, "A")
	_, _ = s.CreateTopic(1, "B")
	_, _ = s.CreateTopic(2, "C")

	topics, err := s.ListTopics(1)
	if err != nil {
		t.Fatalf("ListTopics() error: %v", err)
	}
	if len(topics) != 2 {
		t.Errorf("len = %d, want 2", len(topics))
	}
}

func TestMemStore_ListTopics_EmptyUser(t *testing.T) {
	s := newTestStore()
	topics, err := s.ListTopics(999)
	if err != nil {
		t.Fatalf("ListTopics() error: %v", err)
	}
	if len(topics) != 0 {
		t.Errorf("len = %d, want 0", len(topics))
	}
}

func TestMemStore_GetTopic(t *testing.T) {
	s := newTestStore()
	created, _ := s.CreateTopic(1, "Тест")

	got, err := s.GetTopic(1, created.ID)
	if err != nil {
		t.Fatalf("GetTopic() error: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("ID = %d, want %d", got.ID, created.ID)
	}
}

func TestMemStore_GetTopic_NotFound(t *testing.T) {
	s := newTestStore()
	_, err := s.GetTopic(1, 999)
	if err != errors.ErrTopicNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrTopicNotFound)
	}
}

func TestMemStore_GetTopic_WrongUser(t *testing.T) {
	s := newTestStore()
	created, _ := s.CreateTopic(1, "Тест")
	_, err := s.GetTopic(2, created.ID)
	if err != errors.ErrTopicNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrTopicNotFound)
	}
}

func TestMemStore_DeleteTopic(t *testing.T) {
	s := newTestStore()
	topic, _ := s.CreateTopic(1, "Тест")
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: topic.ID, Text: "Заметка"})

	err := s.DeleteTopic(1, topic.ID)
	if err != nil {
		t.Fatalf("DeleteTopic() error: %v", err)
	}

	_, err = s.GetTopic(1, topic.ID)
	if err != errors.ErrTopicNotFound {
		t.Errorf("topic still exists after delete")
	}

	notes, _ := s.ListNotes(1, topic.ID, nil)
	if len(notes) != 0 {
		t.Errorf("notes of deleted topic: len = %d, want 0", len(notes))
	}
}

func TestMemStore_DeleteTopic_NotFound(t *testing.T) {
	s := newTestStore()
	err := s.DeleteTopic(1, 999)
	if err != errors.ErrTopicNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrTopicNotFound)
	}
}

// --- Notes ---

func TestMemStore_CreateNote(t *testing.T) {
	s := newTestStore()
	note, err := s.CreateNote(model.Note{UserID: 1, TopicID: 2, Text: "Тест"})
	if err != nil {
		t.Fatalf("CreateNote() error: %v", err)
	}
	if note.ID == 0 {
		t.Error("CreateNote() returned zero ID")
	}
	if note.Text != "Тест" {
		t.Errorf("Text = %q, want %q", note.Text, "Тест")
	}
}

func TestMemStore_ListNotes_FilterByTopic(t *testing.T) {
	s := newTestStore()
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 10, Text: "Note A"})
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 20, Text: "Note B"})

	notes, err := s.ListNotes(1, 10, nil)
	if err != nil {
		t.Fatalf("ListNotes() error: %v", err)
	}
	if len(notes) != 1 {
		t.Errorf("len = %d, want 1", len(notes))
	}
	if notes[0].Text != "Note A" {
		t.Errorf("Text = %q, want %q", notes[0].Text, "Note A")
	}
}

func TestMemStore_ListNotes_AllTopics(t *testing.T) {
	s := newTestStore()
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 10, Text: "A"})
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 20, Text: "B"})

	notes, err := s.ListNotes(1, 0, nil)
	if err != nil {
		t.Fatalf("ListNotes() error: %v", err)
	}
	if len(notes) != 2 {
		t.Errorf("len = %d, want 2", len(notes))
	}
}

func TestMemStore_ListNotes_FilterByFolder(t *testing.T) {
	s := newTestStore()
	folderID := int64(5)
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 1, FolderID: &folderID, Text: "In folder"})
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 1, FolderID: nil, Text: "Root"})

	notes, err := s.ListNotes(1, 1, &folderID)
	if err != nil {
		t.Fatalf("ListNotes() error: %v", err)
	}
	if len(notes) != 1 {
		t.Errorf("len = %d, want 1", len(notes))
	}
	if notes[0].Text != "In folder" {
		t.Errorf("Text = %q, want %q", notes[0].Text, "In folder")
	}
}

func TestMemStore_ListNotes_ExcludesArchived(t *testing.T) {
	s := newTestStore()
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "Active"})
	archived, _ := s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "Archived"})
	archived.Archived = true
	_ = s.UpdateNote(archived)

	notes, err := s.ListNotes(1, 1, nil)
	if err != nil {
		t.Fatalf("ListNotes() error: %v", err)
	}
	if len(notes) != 1 {
		t.Errorf("len = %d, want 1", len(notes))
	}
}

func TestMemStore_GetNote(t *testing.T) {
	s := newTestStore()
	created, _ := s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "Test"})

	got, err := s.GetNote(1, created.ID)
	if err != nil {
		t.Fatalf("GetNote() error: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("ID = %d, want %d", got.ID, created.ID)
	}
}

func TestMemStore_GetNote_NotFound(t *testing.T) {
	s := newTestStore()
	_, err := s.GetNote(1, 999)
	if err != errors.ErrNoteNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrNoteNotFound)
	}
}

func TestMemStore_GetNote_WrongUser(t *testing.T) {
	s := newTestStore()
	created, _ := s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "Test"})
	_, err := s.GetNote(2, created.ID)
	if err != errors.ErrNoteNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrNoteNotFound)
	}
}

func TestMemStore_UpdateNote(t *testing.T) {
	s := newTestStore()
	created, _ := s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "Before"})

	created.Text = "After"
	err := s.UpdateNote(created)
	if err != nil {
		t.Fatalf("UpdateNote() error: %v", err)
	}

	got, _ := s.GetNote(1, created.ID)
	if got.Text != "After" {
		t.Errorf("Text = %q, want %q", got.Text, "After")
	}
}

func TestMemStore_UpdateNote_NotFound(t *testing.T) {
	s := newTestStore()
	err := s.UpdateNote(model.Note{ID: 999, UserID: 1})
	if err != errors.ErrNoteNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrNoteNotFound)
	}
}

func TestMemStore_DeleteNote(t *testing.T) {
	s := newTestStore()
	created, _ := s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "Test"})

	err := s.DeleteNote(1, created.ID)
	if err != nil {
		t.Fatalf("DeleteNote() error: %v", err)
	}

	_, err = s.GetNote(1, created.ID)
	if err != errors.ErrNoteNotFound {
		t.Errorf("note still exists after delete")
	}
}

func TestMemStore_DeleteNote_NotFound(t *testing.T) {
	s := newTestStore()
	err := s.DeleteNote(1, 999)
	if err != errors.ErrNoteNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrNoteNotFound)
	}
}

func TestMemStore_CountNotes(t *testing.T) {
	s := newTestStore()
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "A"})
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "B"})
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 2, Text: "C"})

	count, err := s.CountNotes(1, 1, nil)
	if err != nil {
		t.Fatalf("CountNotes() error: %v", err)
	}
	if count != 2 {
		t.Errorf("count = %d, want 2", count)
	}
}

func TestMemStore_ListArchived(t *testing.T) {
	s := newTestStore()
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "Active"})
	arch, _ := s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "Arch"})
	arch.Archived = true
	_ = s.UpdateNote(arch)

	list, err := s.ListArchived(1)
	if err != nil {
		t.Fatalf("ListArchived() error: %v", err)
	}
	if len(list) != 1 {
		t.Errorf("len = %d, want 1", len(list))
	}
	if list[0].Text != "Arch" {
		t.Errorf("Text = %q, want %q", list[0].Text, "Arch")
	}
}

func TestMemStore_CountArchived(t *testing.T) {
	s := newTestStore()
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "A"})
	arch, _ := s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "B"})
	arch.Archived = true
	_ = s.UpdateNote(arch)

	count, err := s.CountArchived(1)
	if err != nil {
		t.Fatalf("CountArchived() error: %v", err)
	}
	if count != 1 {
		t.Errorf("count = %d, want 1", count)
	}
}

func TestMemStore_HasAnyData(t *testing.T) {
	s := newTestStore()
	if s.HasAnyData(1) {
		t.Error("HasAnyData() = true for empty user")
	}

	_, _ = s.CreateTopic(1, "Test")
	if !s.HasAnyData(1) {
		t.Error("HasAnyData() = false after creating topic")
	}
}

func TestMemStore_GetPendingReminders(t *testing.T) {
	s := newTestStore()
	past := time.Now().Add(-1 * time.Hour)
	future := time.Now().Add(1 * time.Hour)

	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "Past", ReminderAt: &past})
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "Future", ReminderAt: &future})
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "None", ReminderAt: nil})

	notes, err := s.GetPendingReminders()
	if err != nil {
		t.Fatalf("GetPendingReminders() error: %v", err)
	}
	if len(notes) != 1 {
		t.Errorf("len = %d, want 1", len(notes))
	}
	if notes[0].Text != "Past" {
		t.Errorf("Text = %q, want %q", notes[0].Text, "Past")
	}
}

func TestMemStore_GetPendingReminders_ExcludesArchived(t *testing.T) {
	s := newTestStore()
	past := time.Now().Add(-1 * time.Hour)
	_, _ = s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "Archived past", ReminderAt: &past, Archived: true})

	notes, err := s.GetPendingReminders()
	if err != nil {
		t.Fatalf("GetPendingReminders() error: %v", err)
	}
	if len(notes) != 0 {
		t.Errorf("len = %d, want 0 (archived notes excluded)", len(notes))
	}
}

func TestMemStore_MoveNote(t *testing.T) {
	s := newTestStore()
	created, _ := s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "Test"})

	folderID := int64(10)
	err := s.MoveNote(1, created.ID, 2, &folderID)
	if err != nil {
		t.Fatalf("MoveNote() error: %v", err)
	}

	got, _ := s.GetNote(1, created.ID)
	if got.TopicID != 2 {
		t.Errorf("TopicID = %d, want 2", got.TopicID)
	}
	if got.FolderID == nil || *got.FolderID != 10 {
		t.Errorf("FolderID = %v, want 10", got.FolderID)
	}
}

func TestMemStore_MoveNote_NotFound(t *testing.T) {
	s := newTestStore()
	err := s.MoveNote(1, 999, 2, nil)
	if err != errors.ErrNoteNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrNoteNotFound)
	}
}

// --- Folders ---

func TestMemStore_CreateFolder(t *testing.T) {
	s := newTestStore()
	folder, err := s.CreateFolder(model.Folder{UserID: 1, TopicID: 2, Name: "Моя папка"})
	if err != nil {
		t.Fatalf("CreateFolder() error: %v", err)
	}
	if folder.ID == 0 {
		t.Error("CreateFolder() returned zero ID")
	}
}

func TestMemStore_CreateFolder_Duplicate(t *testing.T) {
	s := newTestStore()
	_, _ = s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, Name: "Папка"})
	_, err := s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, Name: "Папка"})
	if err != errors.ErrFolderAlreadyExists {
		t.Errorf("error = %v, want %v", err, errors.ErrFolderAlreadyExists)
	}
}

func TestMemStore_CreateFolder_SameNameDiffTopics(t *testing.T) {
	s := newTestStore()
	_, err1 := s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, Name: "Папка"})
	_, err2 := s.CreateFolder(model.Folder{UserID: 1, TopicID: 2, Name: "Папка"})
	if err1 != nil {
		t.Errorf("first CreateFolder() error: %v", err1)
	}
	if err2 != nil {
		t.Errorf("second CreateFolder() error: %v", err2)
	}
}

func TestMemStore_ListFolders(t *testing.T) {
	s := newTestStore()
	_, _ = s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, Name: "F1"})
	_, _ = s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, Name: "F2"})
	_, _ = s.CreateFolder(model.Folder{UserID: 1, TopicID: 2, Name: "F3"})

	folders, err := s.ListFolders(1, 1, nil)
	if err != nil {
		t.Fatalf("ListFolders() error: %v", err)
	}
	if len(folders) != 2 {
		t.Errorf("len = %d, want 2", len(folders))
	}
}

func TestMemStore_ListFolders_WithParent(t *testing.T) {
	s := newTestStore()
	parent, _ := s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, Name: "Parent"})
	_, _ = s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, ParentFolderID: &parent.ID, Name: "Child"})
	_, _ = s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, Name: "Root"})

	children, err := s.ListFolders(1, 1, &parent.ID)
	if err != nil {
		t.Fatalf("ListFolders() error: %v", err)
	}
	if len(children) != 1 {
		t.Errorf("len = %d, want 1", len(children))
	}
	if children[0].Name != "Child" {
		t.Errorf("Name = %q, want %q", children[0].Name, "Child")
	}
}

func TestMemStore_GetFolder(t *testing.T) {
	s := newTestStore()
	created, _ := s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, Name: "Test"})

	got, err := s.GetFolder(1, created.ID)
	if err != nil {
		t.Fatalf("GetFolder() error: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("ID = %d, want %d", got.ID, created.ID)
	}
}

func TestMemStore_GetFolder_NotFound(t *testing.T) {
	s := newTestStore()
	_, err := s.GetFolder(1, 999)
	if err != errors.ErrFolderNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrFolderNotFound)
	}
}

func TestMemStore_GetFolder_WrongUser(t *testing.T) {
	s := newTestStore()
	created, _ := s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, Name: "Test"})
	_, err := s.GetFolder(2, created.ID)
	if err != errors.ErrFolderNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrFolderNotFound)
	}
}

func TestMemStore_GetFolderChain(t *testing.T) {
	s := newTestStore()
	root, _ := s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, Name: "Root"})
	child, _ := s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, ParentFolderID: &root.ID, Name: "Child"})
	grandchild, _ := s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, ParentFolderID: &child.ID, Name: "Grandchild"})

	chain, err := s.GetFolderChain(grandchild.ID)
	if err != nil {
		t.Fatalf("GetFolderChain() error: %v", err)
	}
	if len(chain) != 3 {
		t.Errorf("len = %d, want 3", len(chain))
	}
	if chain[0].Name != "Root" {
		t.Errorf("chain[0] = %q, want Root", chain[0].Name)
	}
	if chain[1].Name != "Child" {
		t.Errorf("chain[1] = %q, want Child", chain[1].Name)
	}
	if chain[2].Name != "Grandchild" {
		t.Errorf("chain[2] = %q, want Grandchild", chain[2].Name)
	}
}

func TestMemStore_GetFolderChain_RootFolder(t *testing.T) {
	s := newTestStore()
	root, _ := s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, Name: "Root"})

	chain, err := s.GetFolderChain(root.ID)
	if err != nil {
		t.Fatalf("GetFolderChain() error: %v", err)
	}
	if len(chain) != 1 {
		t.Errorf("len = %d, want 1", len(chain))
	}
}

func TestMemStore_GetFolderChain_NotFound(t *testing.T) {
	s := newTestStore()
	chain, err := s.GetFolderChain(999)
	if err != nil {
		t.Fatalf("GetFolderChain() error: %v", err)
	}
	if len(chain) != 0 {
		t.Errorf("len = %d, want 0", len(chain))
	}
}

// --- ID автоинкремент ---

func TestMemStore_AutoIncrementIDs(t *testing.T) {
	s := newTestStore()
	t1, _ := s.CreateTopic(1, "T1")
	t2, _ := s.CreateTopic(1, "T2")
	if t2.ID != t1.ID+1 {
		t.Errorf("topic IDs not sequential: %d -> %d", t1.ID, t2.ID)
	}

	n1, _ := s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "N1"})
	n2, _ := s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "N2"})
	if n2.ID != n1.ID+1 {
		t.Errorf("note IDs not sequential: %d -> %d", n1.ID, n2.ID)
	}

	f1, _ := s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, Name: "F1"})
	f2, _ := s.CreateFolder(model.Folder{UserID: 1, TopicID: 1, Name: "F2"})
	if f2.ID != f1.ID+1 {
		t.Errorf("folder IDs not sequential: %d -> %d", f1.ID, f2.ID)
	}

	a1, _ := s.CreateAttachment(model.Attachment{NoteID: 1, Type: model.AttachmentPhoto, FilePath: "files/1/1/a1.jpg"})
	a2, _ := s.CreateAttachment(model.Attachment{NoteID: 1, Type: model.AttachmentPhoto, FilePath: "files/1/1/a2.jpg"})
	if a2.ID != a1.ID+1 {
		t.Errorf("attachment IDs not sequential: %d -> %d", a1.ID, a2.ID)
	}
}

// --- Attachments ---

func TestMemStore_CreateAttachment(t *testing.T) {
	s := newTestStore()
	att, err := s.CreateAttachment(model.Attachment{NoteID: 1, Type: model.AttachmentPhoto, FilePath: "files/1/1/p.jpg"})
	if err != nil {
		t.Fatalf("CreateAttachment() error: %v", err)
	}
	if att.ID == 0 {
		t.Error("CreateAttachment() returned zero ID")
	}
	if att.NoteID != 1 || att.Type != model.AttachmentPhoto {
		t.Errorf("att = %+v, want NoteID=1, Type=photo", att)
	}
}

func TestMemStore_ListAttachments(t *testing.T) {
	s := newTestStore()
	_, _ = s.CreateAttachment(model.Attachment{NoteID: 1, Type: model.AttachmentPhoto, FilePath: "files/1/1/p.jpg"})
	_, _ = s.CreateAttachment(model.Attachment{NoteID: 1, Type: model.AttachmentDocument, FilePath: "files/1/1/d.pdf"})
	_, _ = s.CreateAttachment(model.Attachment{NoteID: 2, Type: model.AttachmentAudio, FilePath: "files/1/2/a.mp3"})

	atts, err := s.ListAttachments(1)
	if err != nil {
		t.Fatalf("ListAttachments() error: %v", err)
	}
	if len(atts) != 2 {
		t.Errorf("len = %d, want 2", len(atts))
	}
	if atts[0].Type != model.AttachmentPhoto {
		t.Errorf("atts[0].Type = %v, want photo", atts[0].Type)
	}
}

func TestMemStore_ListAttachments_Empty(t *testing.T) {
	s := newTestStore()
	atts, err := s.ListAttachments(999)
	if err != nil {
		t.Fatalf("ListAttachments() error: %v", err)
	}
	if len(atts) != 0 {
		t.Errorf("len = %d, want 0", len(atts))
	}
}

func TestMemStore_GetAttachment(t *testing.T) {
	s := newTestStore()
	created, _ := s.CreateAttachment(model.Attachment{NoteID: 1, Type: model.AttachmentPhoto, FilePath: "files/1/1/p.jpg"})

	got, err := s.GetAttachment(created.ID)
	if err != nil {
		t.Fatalf("GetAttachment() error: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("ID = %d, want %d", got.ID, created.ID)
	}
}

func TestMemStore_GetAttachment_NotFound(t *testing.T) {
	s := newTestStore()
	_, err := s.GetAttachment(999)
	if err != errors.ErrAttachmentNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrAttachmentNotFound)
	}
}

func TestMemStore_DeleteAttachment(t *testing.T) {
	s := newTestStore()
	att, _ := s.CreateAttachment(model.Attachment{NoteID: 1, Type: model.AttachmentPhoto, FilePath: "files/1/1/p.jpg"})

	err := s.DeleteAttachment(att.ID)
	if err != nil {
		t.Fatalf("DeleteAttachment() error: %v", err)
	}

	_, err = s.GetAttachment(att.ID)
	if err != errors.ErrAttachmentNotFound {
		t.Errorf("attachment still exists after delete")
	}
	atts, _ := s.ListAttachments(1)
	if len(atts) != 0 {
		t.Errorf("noteAtts not cleaned: len = %d, want 0", len(atts))
	}
}

func TestMemStore_DeleteAttachment_NotFound(t *testing.T) {
	s := newTestStore()
	err := s.DeleteAttachment(999)
	if err != errors.ErrAttachmentNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrAttachmentNotFound)
	}
}

func TestMemStore_DeleteNote_CascadesAttachments(t *testing.T) {
	s := newTestStore()
	note, _ := s.CreateNote(model.Note{UserID: 1, TopicID: 1, Text: "N"})
	_, _ = s.CreateAttachment(model.Attachment{NoteID: note.ID, Type: model.AttachmentPhoto, FilePath: "files/1/1/p.jpg"})

	if err := s.DeleteNote(1, note.ID); err != nil {
		t.Fatalf("DeleteNote() error: %v", err)
	}

	atts, _ := s.ListAttachments(note.ID)
	if len(atts) != 0 {
		t.Errorf("attachments not cascaded: len = %d, want 0", len(atts))
	}
}

func TestMemStore_DeleteTopic_CascadesAttachments(t *testing.T) {
	s := newTestStore()
	topic, _ := s.CreateTopic(1, "T")
	note, _ := s.CreateNote(model.Note{UserID: 1, TopicID: topic.ID, Text: "N"})
	_, _ = s.CreateAttachment(model.Attachment{NoteID: note.ID, Type: model.AttachmentPhoto, FilePath: "files/1/1/p.jpg"})

	if err := s.DeleteTopic(1, topic.ID); err != nil {
		t.Fatalf("DeleteTopic() error: %v", err)
	}

	atts, _ := s.ListAttachments(note.ID)
	if len(atts) != 0 {
		t.Errorf("attachments not cascaded: len = %d, want 0", len(atts))
	}
}

// --- Settings ---

func TestMemStore_GetSettings_NotFound(t *testing.T) {
	s := newTestStore()
	_, err := s.GetSettings(1)
	if err != errors.ErrSettingsNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrSettingsNotFound)
	}
}

func TestMemStore_SaveAndGetSettings(t *testing.T) {
	s := newTestStore()
	settings := model.UserSettings{
		UserID:           1,
		ShowCounts:       true,
		BreadcrumbInline: true,
		BreadcrumbBottom: true,
		ShowKeyboard:     true,
		TimezoneOffset:   4,
		FoldersCollapsed: true,
	}

	if err := s.SaveSettings(settings); err != nil {
		t.Fatalf("SaveSettings() error: %v", err)
	}

	got, err := s.GetSettings(1)
	if err != nil {
		t.Fatalf("GetSettings() error: %v", err)
	}
	if got != settings {
		t.Errorf("settings = %+v, want %+v", got, settings)
	}
}

func TestMemStore_SaveSettings_Overwrite(t *testing.T) {
	s := newTestStore()
	_ = s.SaveSettings(model.UserSettings{UserID: 1, ShowCounts: true, TimezoneOffset: 5})
	_ = s.SaveSettings(model.UserSettings{UserID: 1, ShowCounts: false, TimezoneOffset: 2})

	got, err := s.GetSettings(1)
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

func TestMemStore_Settings_IsolatedPerUser(t *testing.T) {
	s := newTestStore()
	_ = s.SaveSettings(model.UserSettings{UserID: 1, ShowCounts: true})

	_, err := s.GetSettings(2)
	if err != errors.ErrSettingsNotFound {
		t.Errorf("error = %v, want %v", err, errors.ErrSettingsNotFound)
	}
}
