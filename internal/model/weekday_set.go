package model

import (
	"strconv"
	"strings"
	"time"

	"todo-bot-tg/internal/errors"
)

// Weekday — день недели (1 = понедельник … 7 = воскресенье, как в ISO 8601).
// Собственный тип, а не time.Weekday: у последнего неделя начинается
// с воскресенья (0), и «понедельник = 1» читалось бы наоборот.
type Weekday int

const (
	WeekdayMonday    Weekday = 1
	WeekdayTuesday   Weekday = 2
	WeekdayWednesday Weekday = 3
	WeekdayThursday  Weekday = 4
	WeekdayFriday    Weekday = 5
	WeekdaySaturday  Weekday = 6
	WeekdaySunday    Weekday = 7
)

// weekdayLabels — короткие подписи по номеру дня (индекс 0 не используется).
var weekdayLabels = [8]string{"", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"}

// WeekdaySet — набор дней недели (Value Object): иммутабельный, сравнивается
// по значению, внутри — битовая маска (бит d-1 соответствует дню d).
type WeekdaySet struct {
	mask uint8
}

// NewWeekdaySet создаёт набор из дней недели.
// День вне диапазона 1..7 — ошибка; повторы допустимы (это набор).
func NewWeekdaySet(days []Weekday) (WeekdaySet, error) {
	var s WeekdaySet
	for _, d := range days {
		if !d.valid() {
			return WeekdaySet{}, errors.ErrInvalidReminderWeekdays
		}
		s.mask |= 1 << (d - 1)
	}
	return s, nil
}

// valid проверяет, что номер дня лежит в диапазоне 1..7.
func (d Weekday) valid() bool {
	return d >= WeekdayMonday && d <= WeekdaySunday
}

// Label возвращает короткую подпись дня («Пн»).
func (d Weekday) Label() string {
	if !d.valid() {
		return ""
	}
	return weekdayLabels[d]
}

// Contains сообщает, входит ли день в набор.
func (s WeekdaySet) Contains(d Weekday) bool {
	return d.valid() && s.mask&(1<<(d-1)) != 0
}

// IsEmpty сообщает, что в наборе нет ни одного дня.
func (s WeekdaySet) IsEmpty() bool {
	return s.mask == 0
}

// Days возвращает выбранные дни по возрастанию.
func (s WeekdaySet) Days() []Weekday {
	days := make([]Weekday, 0, len(weekdayLabels))
	for d := WeekdayMonday; d <= WeekdaySunday; d++ {
		if s.Contains(d) {
			days = append(days, d)
		}
	}
	return days
}

// String сериализует набор в канонический вид «1,3,5» (дни по возрастанию);
// пустой набор — пустая строка.
func (s WeekdaySet) String() string {
	days := s.Days()
	parts := make([]string, 0, len(days))
	for _, d := range days {
		parts = append(parts, strconv.Itoa(int(d)))
	}
	return strings.Join(parts, ",")
}

// Label возвращает подписи дней через запятую («Пн, Ср») — для сообщений бота.
func (s WeekdaySet) Label() string {
	days := s.Days()
	parts := make([]string, 0, len(days))
	for _, d := range days {
		parts = append(parts, d.Label())
	}
	return strings.Join(parts, ", ")
}

// ParseWeekdaySet разбирает канонический вид «1,3,5».
// Пустая строка (и строка из одних разделителей) даёт пустой набор.
func ParseWeekdaySet(value string) (WeekdaySet, error) {
	var days []Weekday
	for _, part := range strings.Split(value, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		n, err := strconv.Atoi(part)
		if err != nil {
			return WeekdaySet{}, errors.ErrInvalidReminderWeekdays
		}
		days = append(days, Weekday(n))
	}
	return NewWeekdaySet(days)
}

// WeekdayOf возвращает день недели момента в его собственной системе счисления
// времени (для UTC-времени — день недели по UTC).
func WeekdayOf(t time.Time) Weekday {
	if d := t.Weekday(); d != time.Sunday {
		return Weekday(d)
	}
	return WeekdaySunday
}

// NextAfter возвращает ближайший момент со временем суток как у from, день
// недели которого есть в наборе и который строго позже from.
// Для непустого набора результат всегда в пределах семи суток — второе
// возвращаемое значение false возможно только для пустого набора.
func (s WeekdaySet) NextAfter(from time.Time) (time.Time, bool) {
	for i := 1; i <= 7; i++ {
		// AddDate сохраняет время суток (в отличие от прибавления 24 часов,
		// которое ломается на переходе летнего времени).
		next := from.AddDate(0, 0, i)
		if s.Contains(WeekdayOf(next)) {
			return next, true
		}
	}
	return time.Time{}, false
}
