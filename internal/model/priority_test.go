package model

import (
	"testing"

	"todo-bot-tg/internal/errors"
)

func TestNewPriority_Valid(t *testing.T) {
	tests := []struct {
		in   int
		want Priority
	}{
		{0, PriorityNone},
		{1, PriorityLow},
		{2, PriorityMedium},
		{3, PriorityHigh},
	}

	for _, tt := range tests {
		got, err := NewPriority(tt.in)
		if err != nil {
			t.Errorf("NewPriority(%d) unexpected error: %v", tt.in, err)
			continue
		}
		if got != tt.want {
			t.Errorf("NewPriority(%d) = %d, want %d", tt.in, got, tt.want)
		}
	}
}

func TestNewPriority_Invalid(t *testing.T) {
	for _, in := range []int{-1, 4, 100} {
		if _, err := NewPriority(in); err != errors.ErrInvalidPriority {
			t.Errorf("NewPriority(%d) error = %v, want %v", in, err, errors.ErrInvalidPriority)
		}
	}
}

func TestPriority_SortKey(t *testing.T) {
	tests := []struct {
		priority Priority
		want     int
	}{
		{PriorityHigh, 0},
		{PriorityMedium, 1},
		{PriorityNone, 2},
		{PriorityLow, 3},
		{Priority(99), 2}, // неизвестный — как None
	}

	for _, tt := range tests {
		if got := tt.priority.SortKey(); got != tt.want {
			t.Errorf("SortKey(%d) = %d, want %d", tt.priority, got, tt.want)
		}
	}
}

func TestPriority_Emoji(t *testing.T) {
	tests := []struct {
		priority Priority
		want     string
	}{
		{PriorityNone, ""},
		{PriorityLow, "🔵"},
		{PriorityMedium, "🟡"},
		{PriorityHigh, "🔴"},
		{Priority(99), ""},
	}

	for _, tt := range tests {
		if got := tt.priority.Emoji(); got != tt.want {
			t.Errorf("Emoji(%d) = %q, want %q", tt.priority, got, tt.want)
		}
	}
}
