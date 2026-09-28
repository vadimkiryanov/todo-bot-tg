package model

import (
	"strconv"
	"strings"
	"time"

	"todo-bot-tg/internal/errors"
)

// MonthDays — набор чисел месяца (Value Object): иммутабельный, сравнивается
// по значению, внутри — битовая маска (бит d-1 соответствует числу d).
type MonthDays struct {
	mask uint32
}

// NewMonthDays создаёт набор из чисел месяца.
// Число вне диапазона 1..31 — ошибка; повторы допустимы (это набор).
func NewMonthDays(days []int) (MonthDays, error) {
	var s MonthDays
	for _, d := range days {
		if !validMonthDay(d) {
			return MonthDays{}, errors.ErrInvalidReminderMonthDays
		}
		s.mask |= 1 << (d - 1)
	}
	return s, nil
}

// validMonthDay проверяет, что число лежит в диапазоне 1..31.
func validMonthDay(d int) bool {
	return d >= 1 && d <= 31
}

// Contains сообщает, входит ли число в набор.
func (s MonthDays) Contains(d int) bool {
	return validMonthDay(d) && s.mask&(1<<(d-1)) != 0
}

// IsEmpty сообщает, что в наборе нет ни одного числа.
func (s MonthDays) IsEmpty() bool {
	return s.mask == 0
}

// Days возвращает выбранные числа по возрастанию.
func (s MonthDays) Days() []int {
	days := make([]int, 0, 31)
	for d := 1; d <= 31; d++ {
		if s.Contains(d) {
			days = append(days, d)
		}
	}
	return days
}

// String сериализует набор в канонический вид «1,15» (числа по возрастанию);
// пустой набор — пустая строка.
func (s MonthDays) String() string {
	days := s.Days()
	parts := make([]string, 0, len(days))
	for _, d := range days {
		parts = append(parts, strconv.Itoa(d))
	}
	return strings.Join(parts, ",")
}

// Label возвращает числа для сообщений бота («1-го, 15-го»).
func (s MonthDays) Label() string {
	days := s.Days()
	parts := make([]string, 0, len(days))
	for _, d := range days {
		parts = append(parts, strconv.Itoa(d)+"-го")
	}
	return strings.Join(parts, ", ")
}

// ParseMonthDays разбирает канонический вид «1,15».
// Пустая строка (и строка из одних разделителей) даёт пустой набор.
func ParseMonthDays(value string) (MonthDays, error) {
	var days []int
	for _, part := range strings.Split(value, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		n, err := strconv.Atoi(part)
		if err != nil {
			return MonthDays{}, errors.ErrInvalidReminderMonthDays
		}
		days = append(days, n)
	}
	return NewMonthDays(days)
}

// FirstOnOrAfter возвращает сам момент from, если его число есть в наборе, иначе
// ближайшее следующее число набора с тем же временем суток. Пустой набор
// возвращает from без изменений — вызывающий обязан отвергать пустой набор сам.
//
// Нужен при постановке напоминания: дата в календаре клиента выбирается отдельно
// от набора чисел (пикер подставляет число показанной даты, а дата остаётся
// сегодняшней), и без этой сверки напоминание срабатывало бы ещё и в день
// установки — как только время суток дойдёт до выбранного.
func (s MonthDays) FirstOnOrAfter(from time.Time) time.Time {
	if s.Contains(from.Day()) {
		return from
	}
	if next, ok := s.NextAfter(from); ok {
		return next
	}
	return from
}

// NextAfter возвращает ближайший момент со временем суток как у from, число
// которого есть в наборе и который строго позже from. Месяц, где выбранного
// числа нет (31 февраля), пропускается — напоминание в нём не срабатывает.
// Для непустого набора результат всегда в пределах года — второе возвращаемое
// значение false возможно только для пустого набора.
func (s MonthDays) NextAfter(from time.Time) (time.Time, bool) {
	for i := 1; i <= 366; i++ {
		// AddDate сохраняет время суток (в отличие от прибавления 24 часов,
		// которое ломается на переходе летнего времени); перебор реальных дат
		// сам пропускает месяцы без нужного числа.
		next := from.AddDate(0, 0, i)
		if s.Contains(next.Day()) {
			return next, true
		}
	}
	return time.Time{}, false
}
