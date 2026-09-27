package model

import (
	"testing"
	"time"

	"todo-bot-tg/internal/errors"
)

func TestNewMonthDays_Valid(t *testing.T) {
	set, err := NewMonthDays([]int{15, 1, 1})
	if err != nil {
		t.Fatalf("NewMonthDays() unexpected error: %v", err)
	}
	if set.IsEmpty() {
		t.Error("набор не должен быть пустым")
	}
	if !set.Contains(1) || !set.Contains(15) {
		t.Errorf("set = %q, want 1 и 15", set)
	}
	if set.Contains(2) {
		t.Error("в наборе не должно быть 2-го числа")
	}
}

func TestNewMonthDays_Invalid(t *testing.T) {
	for _, d := range []int{0, 32, -1} {
		if _, err := NewMonthDays([]int{d}); err != errors.ErrInvalidReminderMonthDays {
			t.Errorf("NewMonthDays(%d) error = %v, want %v", d, err, errors.ErrInvalidReminderMonthDays)
		}
	}
}

func TestMonthDays_Empty(t *testing.T) {
	set, err := NewMonthDays(nil)
	if err != nil {
		t.Fatalf("NewMonthDays() unexpected error: %v", err)
	}
	if !set.IsEmpty() {
		t.Error("IsEmpty() = false для пустого набора")
	}
	if set.String() != "" {
		t.Errorf("String() = %q, want пустую строку", set.String())
	}
	if set.Label() != "" {
		t.Errorf("Label() = %q, want пустую строку", set.Label())
	}
}

func TestMonthDays_StringAndParse(t *testing.T) {
	set, _ := NewMonthDays([]int{15, 1, 31})
	if got := set.String(); got != "1,15,31" {
		t.Errorf("String() = %q, want %q", got, "1,15,31")
	}
	if got := set.Label(); got != "1-го, 15-го, 31-го" {
		t.Errorf("Label() = %q, want %q", got, "1-го, 15-го, 31-го")
	}

	parsed, err := ParseMonthDays("1,15,31")
	if err != nil {
		t.Fatalf("ParseMonthDays() unexpected error: %v", err)
	}
	if parsed.String() != set.String() {
		t.Errorf("ParseMonthDays() = %q, want %q", parsed, set)
	}

	empty, err := ParseMonthDays("  ")
	if err != nil {
		t.Fatalf("ParseMonthDays(\"  \") unexpected error: %v", err)
	}
	if !empty.IsEmpty() {
		t.Error("ParseMonthDays(\"  \") должен давать пустой набор")
	}

	if _, err := ParseMonthDays("1,abc"); err != errors.ErrInvalidReminderMonthDays {
		t.Errorf("ParseMonthDays(\"1,abc\") error = %v, want %v", err, errors.ErrInvalidReminderMonthDays)
	}
}

func TestMonthDays_NextAfter(t *testing.T) {
	from := time.Date(2026, 8, 6, 15, 0, 0, 0, time.UTC)

	t.Run("ближайшее следующее число из набора", func(t *testing.T) {
		set, _ := NewMonthDays([]int{1, 20})
		next, ok := set.NextAfter(from)
		if !ok {
			t.Fatal("NextAfter() ok = false, want true")
		}
		want := time.Date(2026, 8, 20, 15, 0, 0, 0, time.UTC)
		if !next.Equal(want) {
			t.Errorf("NextAfter() = %v, want %v", next, want)
		}
	})

	t.Run("то же число берётся в следующем месяце", func(t *testing.T) {
		set, _ := NewMonthDays([]int{6})
		next, ok := set.NextAfter(from)
		if !ok {
			t.Fatal("NextAfter() ok = false, want true")
		}
		want := time.Date(2026, 9, 6, 15, 0, 0, 0, time.UTC)
		if !next.Equal(want) {
			t.Errorf("NextAfter() = %v, want %v", next, want)
		}
	})

	t.Run("месяц без выбранного числа пропускается", func(t *testing.T) {
		// 31 января → в феврале 31-го нет, значит 31 марта.
		set, _ := NewMonthDays([]int{31})
		jan31 := time.Date(2026, 1, 31, 15, 0, 0, 0, time.UTC)
		next, ok := set.NextAfter(jan31)
		if !ok {
			t.Fatal("NextAfter() ok = false, want true")
		}
		want := time.Date(2026, 3, 31, 15, 0, 0, 0, time.UTC)
		if !next.Equal(want) {
			t.Errorf("NextAfter() = %v, want %v", next, want)
		}
	})

	t.Run("пустой набор", func(t *testing.T) {
		if _, ok := (MonthDays{}).NextAfter(from); ok {
			t.Error("NextAfter() на пустом наборе ok = true, want false")
		}
	})
}
