package dto

import (
	"testing"

	"github.com/stretchr/testify/require"

	"todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/model"
)

func TestPriorityString(t *testing.T) {
	cases := []struct {
		priority model.Priority
		want     string
	}{
		{model.PriorityNone, "none"},
		{model.PriorityLow, "low"},
		{model.PriorityMedium, "medium"},
		{model.PriorityHigh, "high"},
	}
	for _, tc := range cases {
		require.Equal(t, tc.want, PriorityString(tc.priority), "priority %d", tc.priority)
	}
}

func TestParsePriority(t *testing.T) {
	cases := []struct {
		in   string
		want model.Priority
	}{
		{"none", model.PriorityNone},
		{"low", model.PriorityLow},
		{"medium", model.PriorityMedium},
		{"high", model.PriorityHigh},
	}
	for _, tc := range cases {
		got, err := ParsePriority(tc.in)
		require.NoError(t, err, "вход %q", tc.in)
		require.Equal(t, tc.want, got, "вход %q", tc.in)
	}
}

func TestParsePriority_Invalid(t *testing.T) {
	for _, in := range []string{"", "HIGH", "urgent", "средний", "1"} {
		_, err := ParsePriority(in)
		require.ErrorIs(t, err, errors.ErrInvalidPriority, "вход %q", in)
	}
}

// Round-trip: строка → приоритет → строка для всех значений контракта.
func TestPriority_RoundTrip(t *testing.T) {
	for _, s := range []string{"none", "low", "medium", "high"} {
		p, err := ParsePriority(s)
		require.NoError(t, err)
		require.Equal(t, s, PriorityString(p))
	}
}
