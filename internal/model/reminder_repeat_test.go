package model

import (
	"testing"

	"todo-bot-tg/internal/errors"
)

func TestNewReminderRepeat_Valid(t *testing.T) {
	tests := []struct {
		in   string
		want ReminderRepeat
	}{
		{"once", ReminderRepeatOnce},
		{"daily", ReminderRepeatDaily},
		{"weekly", ReminderRepeatWeekly},
		{"monthly", ReminderRepeatMonthly},
	}

	for _, tt := range tests {
		got, err := NewReminderRepeat(tt.in)
		if err != nil {
			t.Errorf("NewReminderRepeat(%q) unexpected error: %v", tt.in, err)
			continue
		}
		if got != tt.want {
			t.Errorf("NewReminderRepeat(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestNewReminderRepeat_Invalid(t *testing.T) {
	for _, in := range []string{"", "yearly", "ONCE", "daily "} {
		if _, err := NewReminderRepeat(in); err != errors.ErrInvalidReminderRepeat {
			t.Errorf("NewReminderRepeat(%q) error = %v, want %v", in, err, errors.ErrInvalidReminderRepeat)
		}
	}
}
