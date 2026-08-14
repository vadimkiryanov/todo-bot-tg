package model

import (
	"testing"

	"todo-bot-tg/internal/errors"
)

func TestNewAttachment_Success(t *testing.T) {
	att, err := NewAttachment(1, 2, AttachmentPhoto, "file_id_1", "files/1/2/x.jpg", "photo.jpg", "image/jpeg", 2048)
	if err != nil {
		t.Fatalf("NewAttachment() unexpected error: %v", err)
	}
	if att.UserID != 1 {
		t.Errorf("UserID = %d, want 1", att.UserID)
	}
	if att.NoteID != 2 {
		t.Errorf("NoteID = %d, want 2", att.NoteID)
	}
	if att.Type != AttachmentPhoto {
		t.Errorf("Type = %q, want %q", att.Type, AttachmentPhoto)
	}
	if att.FileID != "file_id_1" {
		t.Errorf("FileID = %q, want %q", att.FileID, "file_id_1")
	}
	if att.FilePath != "files/1/2/x.jpg" {
		t.Errorf("FilePath = %q", att.FilePath)
	}
	if att.FileName != "photo.jpg" {
		t.Errorf("FileName = %q", att.FileName)
	}
	if att.MimeType != "image/jpeg" {
		t.Errorf("MimeType = %q", att.MimeType)
	}
	if att.FileSize != 2048 {
		t.Errorf("FileSize = %d, want 2048", att.FileSize)
	}
	if att.CreatedAt.IsZero() {
		t.Error("CreatedAt is zero")
	}
}

func TestNewAttachment_EmptyFileID(t *testing.T) {
	_, err := NewAttachment(1, 2, AttachmentDocument, "", "files/1/2/x", "doc.pdf", "application/pdf", 100)
	if err != errors.ErrEmptyFileID {
		t.Errorf("err = %v, want %v", err, errors.ErrEmptyFileID)
	}
}

func TestNewAttachment_EmptyFilePath(t *testing.T) {
	_, err := NewAttachment(1, 2, AttachmentDocument, "file_id", "", "doc.pdf", "", 100)
	if err != errors.ErrEmptyFilePath {
		t.Errorf("err = %v, want %v", err, errors.ErrEmptyFilePath)
	}
}

func TestNewAttachmentType_Valid(t *testing.T) {
	valid := []string{"photo", "document", "audio", "video", "voice", "video_note", "animation", "sticker"}
	for _, v := range valid {
		if _, err := NewAttachmentType(v); err != nil {
			t.Errorf("NewAttachmentType(%q) unexpected error: %v", v, err)
		}
	}
}

func TestNewAttachmentType_Invalid(t *testing.T) {
	_, err := NewAttachmentType("gif")
	if err != errors.ErrInvalidAttachmentType {
		t.Errorf("err = %v, want %v", err, errors.ErrInvalidAttachmentType)
	}
}
