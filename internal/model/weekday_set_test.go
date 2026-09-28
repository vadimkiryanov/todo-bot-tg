package model

import (
	"testing"
	"time"

	"todo-bot-tg/internal/errors"
)

func TestNewWeekdaySet_Valid(t *testing.T) {
	set, err := NewWeekdaySet([]Weekday{WeekdayFriday, WeekdayMonday, WeekdayMonday})
	if err != nil {
		t.Fatalf("NewWeekdaySet() unexpected error: %v", err)
	}
	if set.IsEmpty() {
		t.Error("набор не должен быть пустым")
	}
	if !set.Contains(WeekdayMonday) || !set.Contains(WeekdayFriday) {
		t.Errorf("set = %q, want Пн+Пт", set)
	}
	if set.Contains(WeekdayTuesday) {
		t.Error("в наборе не должно быть вторника")
	}
}

func TestNewWeekdaySet_Invalid(t *testing.T) {
	for _, d := range []Weekday{0, 8, Weekday(-1)} {
		if _, err := NewWeekdaySet([]Weekday{d}); err != errors.ErrInvalidReminderWeekdays {
			t.Errorf("NewWeekdaySet(%d) error = %v, want %v", d, err, errors.ErrInvalidReminderWeekdays)
		}
	}
}

func TestWeekdaySet_Empty(t *testing.T) {
	set, err := NewWeekdaySet(nil)
	if err != nil {
		t.Fatalf("NewWeekdaySet() unexpected error: %v", err)
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

func TestWeekdaySet_StringAndParse(t *testing.T) {
	set, _ := NewWeekdaySet([]Weekday{WeekdayFriday, WeekdayMonday, WeekdayWednesday})
	if got := set.String(); got != "1,3,5" {
		t.Errorf("String() = %q, want %q", got, "1,3,5")
	}
	if got := set.Label(); got != "Пн, Ср, Пт" {
		t.Errorf("Label() = %q, want %q", got, "Пн, Ср, Пт")
	}

	parsed, err := ParseWeekdaySet("1,3,5")
	if err != nil {
		t.Fatalf("ParseWeekdaySet() unexpected error: %v", err)
	}
	if parsed.String() != set.String() {
		t.Errorf("ParseWeekdaySet() = %q, want %q", parsed, set)
	}

	empty, err := ParseWeekdaySet("  ")
	if err != nil {
		t.Fatalf("ParseWeekdaySet(\"  \") unexpected error: %v", err)
	}
	if !empty.IsEmpty() {
		t.Error("ParseWeekdaySet(\"  \") должен давать пустой набор")
	}

	if _, err := ParseWeekdaySet("1,abc"); err != errors.ErrInvalidReminderWeekdays {
		t.Errorf("ParseWeekdaySet(\"1,abc\") error = %v, want %v", err, errors.ErrInvalidReminderWeekdays)
	}
}

func TestWeekdayOf(t *testing.T) {
	// 2026-08-06 — четверг.
	thursday := time.Date(2026, 8, 6, 15, 0, 0, 0, time.UTC)
	if got := WeekdayOf(thursday); got != WeekdayThursday {
		t.Errorf("WeekdayOf(чт) = %v, want %v", got, WeekdayThursday)
	}
	// 2026-08-09 — воскресенье.
	sunday := time.Date(2026, 8, 9, 15, 0, 0, 0, time.UTC)
	if got := WeekdayOf(sunday); got != WeekdaySunday {
		t.Errorf("WeekdayOf(вс) = %v, want %v", got, WeekdaySunday)
	}
}

func TestWeekdaySet_FirstOnOrAfter(t *testing.T) {
	// Старт — четверг 15:00 UTC.
	from := time.Date(2026, 8, 6, 15, 0, 0, 0, time.UTC)

	t.Run("день из набора — момент не сдвигается", func(t *testing.T) {
		set, _ := NewWeekdaySet([]Weekday{WeekdayThursday, WeekdayMonday})
		if got := set.FirstOnOrAfter(from); !got.Equal(from) {
			t.Errorf("FirstOnOrAfter() = %v, want %v", got, from)
		}
	})

	t.Run("день не из набора — ближайший выбранный день", func(t *testing.T) {
		set, _ := NewWeekdaySet([]Weekday{WeekdayMonday, WeekdayFriday})
		want := time.Date(2026, 8, 7, 15, 0, 0, 0, time.UTC) // пятница, время суток то же
		if got := set.FirstOnOrAfter(from); !got.Equal(want) {
			t.Errorf("FirstOnOrAfter() = %v, want %v", got, want)
		}
	})

	t.Run("пустой набор — момент без изменений", func(t *testing.T) {
		if got := (WeekdaySet{}).FirstOnOrAfter(from); !got.Equal(from) {
			t.Errorf("FirstOnOrAfter() = %v, want %v", got, from)
		}
	})
}

func TestWeekdaySet_NextAfter(t *testing.T) {
	// Старт — четверг 15:00 UTC.
	from := time.Date(2026, 8, 6, 15, 0, 0, 0, time.UTC)

	t.Run("ближайший следующий день из набора", func(t *testing.T) {
		set, _ := NewWeekdaySet([]Weekday{WeekdayMonday, WeekdayFriday})
		next, ok := set.NextAfter(from)
		if !ok {
			t.Fatal("NextAfter() ok = false, want true")
		}
		want := time.Date(2026, 8, 7, 15, 0, 0, 0, time.UTC) // пятница
		if !next.Equal(want) {
			t.Errorf("NextAfter() = %v, want %v", next, want)
		}
	})

	t.Run("тот же день недели берётся через неделю", func(t *testing.T) {
		set, _ := NewWeekdaySet([]Weekday{WeekdayThursday})
		next, ok := set.NextAfter(from)
		if !ok {
			t.Fatal("NextAfter() ok = false, want true")
		}
		want := time.Date(2026, 8, 13, 15, 0, 0, 0, time.UTC)
		if !next.Equal(want) {
			t.Errorf("NextAfter() = %v, want %v", next, want)
		}
	})

	t.Run("пустой набор", func(t *testing.T) {
		if _, ok := (WeekdaySet{}).NextAfter(from); ok {
			t.Error("NextAfter() на пустом наборе ok = true, want false")
		}
	})
}
