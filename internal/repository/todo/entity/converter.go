package entity

import (
	"encoding/json"

	"todo-bot-tg/internal/model"
	"todo-bot-tg/internal/user"
)

// NoteToRecord конвертирует доменную модель в persistence-record.
// Сущности форматирования сериализуются в JSON (пустой список — пустая строка).
func NoteToRecord(n model.Note) NoteRecord {
	return NoteRecord{
		ID:             n.ID,
		UserID:         n.UserID,
		TopicID:        n.TopicID,
		FolderID:       n.FolderID,
		Text:           n.Text,
		Entities:       marshalNoteEntities(n.Entities),
		Priority:       int(n.Priority),
		ReminderAt:     n.ReminderAt,
		ReminderRepeat: string(n.ReminderRepeat),
		CreatedAt:      n.CreatedAt,
		Archived:       n.Archived,
		Done:           n.Done,
		Pinned:         n.Pinned,
		PinnedUntil:    n.PinnedUntil,
	}
}

// marshalNoteEntities сериализует сущности форматирования в JSON.
// Ошибка сериализации невозможна для наших типов — возвращаем пустую строку.
func marshalNoteEntities(entities []model.NoteEntity) string {
	if len(entities) == 0 {
		return ""
	}
	data, err := json.Marshal(entities)
	if err != nil {
		return ""
	}
	return string(data)
}

// NoteFromRecord конвертирует persistence-record в доменную модель.
// Невалидное значение ReminderRepeat из хранилища заменяется дефолтом
// (ReminderRepeatOnce), а не проглатывается молча.
// Битый JSON сущностей игнорируется (заметка остаётся без форматирования).
func NoteFromRecord(r NoteRecord) model.Note {
	repeat := model.ReminderRepeatOnce
	if parsed, err := model.NewReminderRepeat(r.ReminderRepeat); err == nil {
		repeat = parsed
	}
	return model.Note{
		ID:             r.ID,
		UserID:         r.UserID,
		TopicID:        r.TopicID,
		FolderID:       r.FolderID,
		Text:           r.Text,
		Entities:       unmarshalNoteEntities(r.Entities),
		Priority:       model.Priority(r.Priority),
		ReminderAt:     r.ReminderAt,
		ReminderRepeat: repeat,
		CreatedAt:      r.CreatedAt,
		Archived:       r.Archived,
		Done:           r.Done,
		Pinned:         r.Pinned,
		PinnedUntil:    r.PinnedUntil,
	}
}

// unmarshalNoteEntities разбирает JSON-представление сущностей форматирования.
// Пустая строка или битый JSON дают nil (без форматирования).
func unmarshalNoteEntities(data string) []model.NoteEntity {
	if data == "" {
		return nil
	}
	var entities []model.NoteEntity
	if err := json.Unmarshal([]byte(data), &entities); err != nil {
		return nil
	}
	return entities
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

// SettingsToRecord конвертирует доменную модель настроек в persistence-record.
func SettingsToRecord(s model.UserSettings) SettingsRecord {
	return SettingsRecord{
		UserID:           s.UserID,
		ShowCounts:       s.ShowCounts,
		BreadcrumbInline: s.BreadcrumbInline,
		BreadcrumbBottom: s.BreadcrumbBottom,
		ShowKeyboard:     s.ShowKeyboard,
		TimezoneOffset:   s.TimezoneOffset,
		FoldersCollapsed: s.FoldersCollapsed,
		QuickTopicsCount: s.QuickTopicsCount,
	}
}

// SettingsFromRecord конвертирует persistence-record в доменную модель настроек.
func SettingsFromRecord(r SettingsRecord) model.UserSettings {
	return model.UserSettings{
		UserID:           r.UserID,
		ShowCounts:       r.ShowCounts,
		BreadcrumbInline: r.BreadcrumbInline,
		BreadcrumbBottom: r.BreadcrumbBottom,
		ShowKeyboard:     r.ShowKeyboard,
		TimezoneOffset:   r.TimezoneOffset,
		FoldersCollapsed: r.FoldersCollapsed,
		QuickTopicsCount: r.QuickTopicsCount,
	}
}

// UserToRecord конвертирует доменную модель пользователя в persistence-record.
func UserToRecord(u user.User) UserRecord {
	return UserRecord{
		ID:           u.ID,
		Username:     u.Username,
		PasswordHash: u.PasswordHash,
		TelegramID:   u.TelegramID,
	}
}

// UserFromRecord конвертирует persistence-record в доменную модель пользователя.
func UserFromRecord(r UserRecord) user.User {
	return user.User{
		ID:           r.ID,
		Username:     r.Username,
		PasswordHash: r.PasswordHash,
		TelegramID:   r.TelegramID,
	}
}

// NotificationToRecord конвертирует доменную модель уведомления в persistence-record.
func NotificationToRecord(n model.Notification) NotificationRecord {
	return NotificationRecord{
		ID:      n.ID,
		UserID:  n.UserID,
		NoteID:  n.NoteID,
		Text:    n.Text,
		FiredAt: n.FiredAt,
		Read:    n.Read,
	}
}

// NotificationFromRecord конвертирует persistence-record в доменную модель уведомления.
func NotificationFromRecord(r NotificationRecord) model.Notification {
	return model.Notification{
		ID:      r.ID,
		UserID:  r.UserID,
		NoteID:  r.NoteID,
		Text:    r.Text,
		FiredAt: r.FiredAt,
		Read:    r.Read,
	}
}
