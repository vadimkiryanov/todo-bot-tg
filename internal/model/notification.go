package model

import "time"

// Notification — запись журнала «пришедших уведомлений» (сработавших
// напоминаний). Пишется при обработке просроченного напоминания, чтобы веб
// мог показать историю (🔔) независимо от способа доставки (Telegram и т.п.).
type Notification struct {
	ID      int64
	UserID  int64
	NoteID  int64 // заметка, на которую сработало напоминание (может быть удалена позже)
	Text    string
	FiredAt time.Time
	Read    bool
}
