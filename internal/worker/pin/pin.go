// Package pin — фоновый воркер открепления заметок с истёкшим сроком.
//
// Не зависит от Telegram API: вся работа сводится к вызову сервиса,
// который сам открепляет заметки (см. Service.ProcessExpiredPins).
package pin

import (
	"log/slog"
	"time"
)

// NoteService — интерфейс сервиса закрепления (определён потребителем — воркером).
type NoteService interface {
	ProcessExpiredPins() error
}

// Worker — фоновый воркер, периодически открепляет просроченные закрепления.
type Worker struct {
	noteService NoteService
	interval    time.Duration
	stopCh      chan struct{}
}

// NewWorker создаёт воркер с интервалом опроса по умолчанию (30 секунд).
func NewWorker(noteService NoteService) *Worker {
	return &Worker{
		noteService: noteService,
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

// processOnce открепляет просроченные закрепления за один проход.
func (w *Worker) processOnce() {
	if err := w.noteService.ProcessExpiredPins(); err != nil {
		slog.Error("открепление просроченных закреплений", "error", err)
	}
}
