package pin

import (
	"testing"
	"time"

	"todo-bot-tg/internal/errors"
)

// mockNoteService — заглушка сервиса закреплений.
type mockNoteService struct {
	calls int
	err   error
}

func (m *mockNoteService) ProcessExpiredPins() error {
	m.calls++
	return m.err
}

func TestWorker_ProcessesExpiredPins(t *testing.T) {
	svc := &mockNoteService{}
	w := NewWorker(svc)

	w.processOnce()

	if svc.calls != 1 {
		t.Fatalf("ожидался 1 вызов ProcessExpiredPins, получено %d", svc.calls)
	}
}

func TestWorker_ErrorInService_NoPanic(t *testing.T) {
	svc := &mockNoteService{err: errors.ErrNotFound}
	w := NewWorker(svc)

	// Ошибка сервиса логируется воркером и не должна ронять тест.
	w.processOnce()

	if svc.calls != 1 {
		t.Fatalf("ожидался 1 вызов ProcessExpiredPins, получено %d", svc.calls)
	}
}

func TestWorker_StartStop(t *testing.T) {
	svc := &mockNoteService{}
	w := NewWorker(svc)
	w.interval = 10 * time.Millisecond

	w.Start()
	time.Sleep(50 * time.Millisecond)
	w.Stop()

	if svc.calls == 0 {
		t.Fatal("воркер не вызывал ProcessExpiredPins за время работы")
	}
}
