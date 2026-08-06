package model

import (
	"testing"

	"todo-bot-tg/internal/errors"
)

func TestNewTopic_Success(t *testing.T) {
	topic, err := NewTopic(1, "🏠 Личное")
	if err != nil {
		t.Fatalf("NewTopic() unexpected error: %v", err)
	}
	if topic.UserID != 1 {
		t.Errorf("UserID = %d, want 1", topic.UserID)
	}
	if topic.Name != "🏠 Личное" {
		t.Errorf("Name = %q, want %q", topic.Name, "🏠 Личное")
	}
	if topic.ID != 0 {
		t.Errorf("ID = %d, want 0 (unassigned)", topic.ID)
	}
}

func TestNewTopic_EmptyName(t *testing.T) {
	_, err := NewTopic(1, "")
	if err != errors.ErrEmptyName {
		t.Errorf("error = %v, want %v", err, errors.ErrEmptyName)
	}
}

func TestNewTopic_DifferentUsers(t *testing.T) {
	t1, err := NewTopic(100, "Топик А")
	if err != nil {
		t.Fatalf("NewTopic() unexpected error: %v", err)
	}
	t2, err := NewTopic(200, "Топик А")
	if err != nil {
		t.Fatalf("NewTopic() unexpected error: %v", err)
	}
	if t1.UserID != 100 {
		t.Errorf("UserID = %d, want 100", t1.UserID)
	}
	if t2.UserID != 200 {
		t.Errorf("UserID = %d, want 200", t2.UserID)
	}
}
