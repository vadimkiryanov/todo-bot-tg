package model

import "todo-bot-tg/internal/errors"

// ReminderRepeat — тип повторения напоминания (Value Object).
type ReminderRepeat string

const (
	ReminderRepeatOnce  ReminderRepeat = "once"
	ReminderRepeatDaily ReminderRepeat = "daily"
)

// NewReminderRepeat создаёт ReminderRepeat с валидацией значения.
func NewReminderRepeat(s string) (ReminderRepeat, error) {
	r := ReminderRepeat(s)
	if !r.valid() {
		return "", errors.ErrInvalidReminderRepeat
	}
	return r, nil
}

// valid проверяет, что значение повторения допустимо.
func (r ReminderRepeat) valid() bool {
	switch r {
	case ReminderRepeatOnce, ReminderRepeatDaily:
		return true
	default:
		return false
	}
}
