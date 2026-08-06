package model

import (
	"testing"
	"time"

	"todo-bot-tg/internal/errors"
)

func TestNewNote_Success(t *testing.T) {
	note, err := NewNote(1, 2, nil, "Купить хлеб")
	if err != nil {
		t.Fatalf("NewNote() unexpected error: %v", err)
	}
	if note.UserID != 1 {
		t.Errorf("UserID = %d, want 1", note.UserID)
	}
	if note.TopicID != 2 {
		t.Errorf("TopicID = %d, want 2", note.TopicID)
	}
	if note.FolderID != nil {
		t.Errorf("FolderID = %v, want nil", note.FolderID)
	}
	if note.Text != "Купить хлеб" {
		t.Errorf("Text = %q, want %q", note.Text, "Купить хлеб")
	}
	if note.Priority != PriorityNone {
		t.Errorf("Priority = %d, want %d", note.Priority, PriorityNone)
	}
	if note.Archived {
		t.Error("Archived = true, want false")
	}
	if note.CreatedAt.IsZero() {
		t.Error("CreatedAt is zero")
	}
}

func TestNewNote_EmptyText(t *testing.T) {
	_, err := NewNote(1, 0, nil, "")
	if err != errors.ErrEmptyText {
		t.Errorf("error = %v, want %v", err, errors.ErrEmptyText)
	}
}

func TestNewNote_WithFolder(t *testing.T) {
	folderID := int64(42)
	note, err := NewNote(1, 2, &folderID, "Текст")
	if err != nil {
		t.Fatalf("NewNote() unexpected error: %v", err)
	}
	if note.FolderID == nil || *note.FolderID != 42 {
		t.Errorf("FolderID = %v, want 42", note.FolderID)
	}
}

func TestNote_PriorityEmoji(t *testing.T) {
	tests := []struct {
		priority int
		want     string
	}{
		{PriorityNone, ""},
		{PriorityLow, "🌿"},
		{PriorityMedium, "⚡"},
		{PriorityHigh, "🔥"},
		{99, ""},
	}

	for _, tt := range tests {
		n := &Note{Priority: tt.priority}
		if got := n.PriorityEmoji(); got != tt.want {
			t.Errorf("PriorityEmoji(%d) = %q, want %q", tt.priority, got, tt.want)
		}
	}
}

func TestNote_Archive(t *testing.T) {
	n := &Note{Archived: false}
	n.Archive()
	if !n.Archived {
		t.Error("Archive() did not set Archived to true")
	}
}

func TestNote_Unarchive(t *testing.T) {
	n := &Note{Archived: true}
	n.Unarchive()
	if n.Archived {
		t.Error("Unarchive() did not set Archived to false")
	}
}

func TestNote_EditText_Success(t *testing.T) {
	n := &Note{Text: "Старый текст"}
	err := n.EditText("Новый текст")
	if err != nil {
		t.Fatalf("EditText() unexpected error: %v", err)
	}
	if n.Text != "Новый текст" {
		t.Errorf("Text = %q, want %q", n.Text, "Новый текст")
	}
}

func TestNote_EditText_Empty(t *testing.T) {
	n := &Note{Text: "Старый текст"}
	err := n.EditText("")
	if err != errors.ErrEmptyText {
		t.Errorf("error = %v, want %v", err, errors.ErrEmptyText)
	}
	if n.Text != "Старый текст" {
		t.Errorf("Text changed to %q, should remain unchanged", n.Text)
	}
}

func TestNote_ReminderAt(t *testing.T) {
	reminder := time.Date(2026, 8, 6, 15, 0, 0, 0, time.UTC)
	n := &Note{ReminderAt: &reminder}
	if n.ReminderAt == nil || !n.ReminderAt.Equal(reminder) {
		t.Errorf("ReminderAt = %v, want %v", n.ReminderAt, reminder)
	}

	n.ReminderAt = nil
	if n.ReminderAt != nil {
		t.Error("ReminderAt should be nil after clearing")
	}
}
