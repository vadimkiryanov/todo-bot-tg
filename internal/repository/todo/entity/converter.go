package entity

import "todo-bot-tg/internal/model"

// NoteToRecord конвертирует доменную модель в persistence-record.
func NoteToRecord(n model.Note) NoteRecord {
	return NoteRecord{
		ID:             n.ID,
		UserID:         n.UserID,
		TopicID:        n.TopicID,
		FolderID:       n.FolderID,
		Text:           n.Text,
		Priority:       n.Priority,
		ReminderAt:     n.ReminderAt,
		ReminderRepeat: string(n.ReminderRepeat),
		CreatedAt:      n.CreatedAt,
		Archived:       n.Archived,
		Done:           n.Done,
	}
}

// NoteFromRecord конвертирует persistence-record в доменную модель.
func NoteFromRecord(r NoteRecord) model.Note {
	return model.Note{
		ID:             r.ID,
		UserID:         r.UserID,
		TopicID:        r.TopicID,
		FolderID:       r.FolderID,
		Text:           r.Text,
		Priority:       r.Priority,
		ReminderAt:     r.ReminderAt,
		ReminderRepeat: model.ReminderRepeat(r.ReminderRepeat),
		CreatedAt:      r.CreatedAt,
		Archived:       r.Archived,
		Done:           r.Done,
	}
}

// TopicToRecord конвертирует доменную модель в persistence-record.
func TopicToRecord(t model.Topic) TopicRecord {
	return TopicRecord{
		ID:     t.ID,
		UserID: t.UserID,
		Name:   t.Name,
	}
}

// TopicFromRecord конвертирует persistence-record в доменную модель.
func TopicFromRecord(r TopicRecord) model.Topic {
	return model.Topic{
		ID:     r.ID,
		UserID: r.UserID,
		Name:   r.Name,
	}
}

// FolderToRecord конвертирует доменную модель папки в persistence-record.
func FolderToRecord(f model.Folder) FolderRecord {
	return FolderRecord{
		ID:             f.ID,
		UserID:         f.UserID,
		TopicID:        f.TopicID,
		ParentFolderID: f.ParentFolderID,
		Name:           f.Name,
	}
}

// FolderFromRecord конвертирует persistence-record в доменную модель папки.
func FolderFromRecord(r FolderRecord) model.Folder {
	return model.Folder{
		ID:             r.ID,
		UserID:         r.UserID,
		TopicID:        r.TopicID,
		ParentFolderID: r.ParentFolderID,
		Name:           r.Name,
	}
}

// AttachmentToRecord конвертирует доменную модель вложения в persistence-record.
func AttachmentToRecord(a model.Attachment) AttachmentRecord {
	return AttachmentRecord{
		ID:        a.ID,
		NoteID:    a.NoteID,
		UserID:    a.UserID,
		Type:      string(a.Type),
		FileID:    a.FileID,
		FilePath:  a.FilePath,
		FileName:  a.FileName,
		MimeType:  a.MimeType,
		FileSize:  a.FileSize,
		CreatedAt: a.CreatedAt,
	}
}

// AttachmentFromRecord конвертирует persistence-record в доменную модель вложения.
func AttachmentFromRecord(r AttachmentRecord) model.Attachment {
	return model.Attachment{
		ID:        r.ID,
		NoteID:    r.NoteID,
		UserID:    r.UserID,
		Type:      model.AttachmentType(r.Type),
		FileID:    r.FileID,
		FilePath:  r.FilePath,
		FileName:  r.FileName,
		MimeType:  r.MimeType,
		FileSize:  r.FileSize,
		CreatedAt: r.CreatedAt,
	}
}
