package entity

import "todo-bot-tg/internal/model"

// NoteToRecord конвертирует доменную модель в persistence-record.
func NoteToRecord(n model.Note) NoteRecord {
	return NoteRecord{
		ID:         n.ID,
		UserID:     n.UserID,
		TopicID:    n.TopicID,
		Text:       n.Text,
		Priority:   n.Priority,
		ReminderAt: n.ReminderAt,
		CreatedAt:  n.CreatedAt,
		Archived:   n.Archived,
	}
}

// NoteFromRecord конвертирует persistence-record в доменную модель.
func NoteFromRecord(r NoteRecord) model.Note {
	return model.Note{
		ID:         r.ID,
		UserID:     r.UserID,
		TopicID:    r.TopicID,
		Text:       r.Text,
		Priority:   r.Priority,
		ReminderAt: r.ReminderAt,
		CreatedAt:  r.CreatedAt,
		Archived:   r.Archived,
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
