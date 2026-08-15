package model

import "todo-bot-tg/internal/errors"

// Priority — приоритет заметки (Value Object).
type Priority int

const (
	PriorityNone   Priority = 0
	PriorityLow    Priority = 1
	PriorityMedium Priority = 2
	PriorityHigh   Priority = 3
)

// NewPriority создаёт Priority с валидацией допустимого диапазона.
func NewPriority(v int) (Priority, error) {
	p := Priority(v)
	if !p.valid() {
		return 0, errors.ErrInvalidPriority
	}
	return p, nil
}

// valid проверяет, что приоритет находится в допустимом диапазоне.
func (p Priority) valid() bool {
	switch p {
	case PriorityNone, PriorityLow, PriorityMedium, PriorityHigh:
		return true
	default:
		return false
	}
}

// SortKey возвращает ключ сортировки: High(0) < Medium(1) < None(2) < Low(3).
func (p Priority) SortKey() int {
	switch p {
	case PriorityHigh:
		return 0
	case PriorityMedium:
		return 1
	case PriorityNone:
		return 2
	case PriorityLow:
		return 3
	default:
		return 2 // неизвестный приоритет — как None
	}
}

// Emoji возвращает эмодзи приоритета (пустая строка для None).
func (p Priority) Emoji() string {
	switch p {
	case PriorityHigh:
		return "🔴"
	case PriorityMedium:
		return "🟡"
	case PriorityLow:
		return "🔵"
	default:
		return ""
	}
}
