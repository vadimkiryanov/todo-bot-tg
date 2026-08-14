// Package reminder — фоновый воркер проверки просроченных напоминаний.
//
// Не зависит от Telegram API: отправка сообщений идёт через порт
// NotificationSender, который реализует транспортный слой (handler).
package reminder

import (
	"time"

	"todo-bot-tg/internal/model"
)

// NoteService — интерфейс сервиса напоминаний (определён потребителем — воркером).
type NoteService interface {
	ProcessPendingReminders() ([]model.Note, error)
}

// NotificationSender — порт отправки напоминаний.
// Реализуется handler'ом; воркер ничего не знает о способе доставки.
type NotificationSender interface {
	SendReminder(note model.Note) error
}

// Worker — фоновый воркер, периодически опрашивает просроченные напоминания
// и отправляет их через NotificationSender.
type Worker struct {
	noteService NoteService
	sender      NotificationSender
	interval    time.Duration
	stopCh      chan struct{}
}

// NewWorker создаёт воркер с интервалом опроса по умолчанию (30 секунд).
func NewWorker(noteService NoteService, sender NotificationSender) *Worker {
	return &Worker{
		noteService: noteService,
		sender:      sender,
		interval:    30 * time.Second,
		stopCh:      make(chan struct{}),
	}
}

// Start запускает цикл опроса в фоновой горутине.
func (w *Worker) Start() {
	go func() {
		ticker := time.NewTicker(w.interval)
		defer ticker.Stop()
		for {
			select {
			case <-w.stopCh:
				return
			case <-ticker.C:
				w.processOnce()
			}
		}
	}()
}

// Stop останавливает воркер.
func (w *Worker) Stop() {
	close(w.stopCh)
}

// processOnce обрабатывает просроченные напоминания за один проход.
func (w *Worker) processOnce() {
	notes, err := w.noteService.ProcessPendingReminders()
	if err != nil {
		return
	}
	for _, n := range notes {
		_ = w.sender.SendReminder(n)
	}
}
