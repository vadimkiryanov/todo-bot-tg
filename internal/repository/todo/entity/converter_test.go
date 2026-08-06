package entity

import (
	"testing"
	"time"

	"todo-bot-tg/internal/model"
)

func TestNoteToRecord_RoundTrip(t *testing.T) {
	reminder := time.Date(2026, 8, 6, 15, 0, 0, 0, time.UTC)
	folderID := int64(42)
	original := model.Note{
		ID:         100,
		UserID:     1,
		TopicID:    2,
		FolderID:   &folderID,
		Text:       "Тестовая заметка",
		Priority:   model.PriorityHigh,
		ReminderAt: &reminder,
		CreatedAt:  time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		Archived:   true,
	}

	record := NoteToRecord(original)
	result := NoteFromRecord(record)

	if result.ID != original.ID {
		t.Errorf("ID = %d, want %d", result.ID, original.ID)
	}
	if result.UserID != original.UserID {
		t.Errorf("UserID = %d, want %d", result.UserID, original.UserID)
	}
	if result.TopicID != original.TopicID {
		t.Errorf("TopicID = %d, want %d", result.TopicID, original.TopicID)
	}
	if result.FolderID == nil || *result.FolderID != folderID {
		t.Errorf("FolderID = %v, want %d", result.FolderID, folderID)
	}
	if result.Text != original.Text {
		t.Errorf("Text = %q, want %q", result.Text, original.Text)
	}
	if result.Priority != original.Priority {
		t.Errorf("Priority = %d, want %d", result.Priority, original.Priority)
	}
	if result.ReminderAt == nil || !result.ReminderAt.Equal(reminder) {
		t.Errorf("ReminderAt = %v, want %v", result.ReminderAt, reminder)
	}
	if !result.CreatedAt.Equal(original.CreatedAt) {
		t.Errorf("CreatedAt = %v, want %v", result.CreatedAt, original.CreatedAt)
	}
	if result.Archived != original.Archived {
		t.Errorf("Archived = %v, want %v", result.Archived, original.Archived)
	}
}

func TestNoteToRecord_NilFields(t *testing.T) {
	original := model.Note{
		ID:      1,
		UserID:  1,
		Text:    "Без папки и напоминания",
	}

	record := NoteToRecord(original)
	result := NoteFromRecord(record)

	if result.FolderID != nil {
		t.Errorf("FolderID = %v, want nil", result.FolderID)
	}
	if result.ReminderAt != nil {
		t.Errorf("ReminderAt = %v, want nil", result.ReminderAt)
	}
}

func TestTopicToRecord_RoundTrip(t *testing.T) {
	original := model.Topic{
		ID:     10,
		UserID: 5,
		Name:   "🏠 Личное",
	}

	record := TopicToRecord(original)
	result := TopicFromRecord(record)

	if result.ID != original.ID {
		t.Errorf("ID = %d, want %d", result.ID, original.ID)
	}
	if result.UserID != original.UserID {
		t.Errorf("UserID = %d, want %d", result.UserID, original.UserID)
	}
	if result.Name != original.Name {
		t.Errorf("Name = %q, want %q", result.Name, original.Name)
	}
}

func TestFolderToRecord_RoundTrip(t *testing.T) {
	parentID := int64(5)
	original := model.Folder{
		ID:             20,
		UserID:         3,
		TopicID:        7,
		ParentFolderID: &parentID,
		Name:           "Подпапка",
	}

	record := FolderToRecord(original)
	result := FolderFromRecord(record)

	if result.ID != original.ID {
		t.Errorf("ID = %d, want %d", result.ID, original.ID)
	}
	if result.UserID != original.UserID {
		t.Errorf("UserID = %d, want %d", result.UserID, original.UserID)
	}
	if result.TopicID != original.TopicID {
		t.Errorf("TopicID = %d, want %d", result.TopicID, original.TopicID)
	}
	if result.ParentFolderID == nil || *result.ParentFolderID != parentID {
		t.Errorf("ParentFolderID = %v, want %d", result.ParentFolderID, parentID)
	}
	if result.Name != original.Name {
		t.Errorf("Name = %q, want %q", result.Name, original.Name)
	}
}

func TestFolderToRecord_NilParent(t *testing.T) {
	original := model.Folder{
		ID:      1,
		UserID:  1,
		TopicID: 1,
		Name:    "Корневая папка",
	}

	record := FolderToRecord(original)
	result := FolderFromRecord(record)

	if result.ParentFolderID != nil {
		t.Errorf("ParentFolderID = %v, want nil", result.ParentFolderID)
	}
}
