package model

import (
	"testing"

	"todo-bot-tg/internal/errors"
)

func TestNewFolder_Success(t *testing.T) {
	folder, err := NewFolder(1, 2, nil, "Моя папка")
	if err != nil {
		t.Fatalf("NewFolder() unexpected error: %v", err)
	}
	if folder.UserID != 1 {
		t.Errorf("UserID = %d, want 1", folder.UserID)
	}
	if folder.TopicID != 2 {
		t.Errorf("TopicID = %d, want 2", folder.TopicID)
	}
	if folder.ParentFolderID != nil {
		t.Errorf("ParentFolderID = %v, want nil", folder.ParentFolderID)
	}
	if folder.Name != "Моя папка" {
		t.Errorf("Name = %q, want %q", folder.Name, "Моя папка")
	}
	if folder.ID != 0 {
		t.Errorf("ID = %d, want 0 (unassigned)", folder.ID)
	}
}

func TestNewFolder_EmptyName(t *testing.T) {
	_, err := NewFolder(1, 2, nil, "")
	if err != errors.ErrEmptyFolderName {
		t.Errorf("error = %v, want %v", err, errors.ErrEmptyFolderName)
	}
}

func TestNewFolder_WithParent(t *testing.T) {
	parentID := int64(10)
	folder, err := NewFolder(1, 2, &parentID, "Подпапка")
	if err != nil {
		t.Fatalf("NewFolder() unexpected error: %v", err)
	}
	if folder.ParentFolderID == nil || *folder.ParentFolderID != 10 {
		t.Errorf("ParentFolderID = %v, want 10", folder.ParentFolderID)
	}
}
