package reminder

import (
	"testing"
	"time"

	"todo-bot-tg/internal/errors"
	"todo-bot-tg/internal/model"
)

// mockNoteService — заглушка сервиса напоминаний.
type mockNoteService struct {
	notes []model.Note
	err   error
}

func (m *mockNoteService) ProcessPendingReminders() ([]model.Note, error) {
	return m.notes, m.err
}

// mockSender — записывает отправленные напоминания.
type mockSender struct {
	sent []model.Note
}

func (m *mockSender) SendReminder(note model.Note) error {
	m.sent = append(m.sent, note)
	return nil
}

func TestWorker_SendsPendingReminders(t *testing.T) {
	svc := &mockNoteService{notes: []model.Note{
		{ID: 1, UserID: 100, Text: "Заметка 1"},
		{ID: 2, UserID: 200, Text: "Заметка 2"},
	}}
	sender := &mockSender{}
	w := NewWorker(svc, sender)

	w.processOnce()

	if len(sender.sent) != 2 {
		t.Fatalf("ожидалось 2 отправки, получено %d", len(sender.sent))
	}
	if sender.sent[0].ID != 1 || sender.sent[1].ID != 2 {
		t.Fatalf("отправлены не те заметки: %+v", sender.sent)
	}
}

func TestWorker_ErrorInService_SkipsSend(t *testing.T) {
	svc := &mockNoteService{err: errors.ErrNotFound}
	sender := &mockSender{}
	w := NewWorker(svc, sender)

	w.processOnce()

	if len(sender.sent) != 0 {
		t.Fatalf("не ожидалось отправок при ошибке сервиса, получено %d", len(sender.sent))
	}
}

func TestWorker_StartStop(t *testing.T) {
	svc := &mockNoteService{notes: []model.Note{{ID: 1, UserID: 100, Text: "Тест"}}}
	sender := &mockSender{}
	w := NewWorker(svc, sender)
	// Уменьшаем интервал для быстрого теста
	w.interval = 10 * time.Millisecond

	w.Start()
	time.Sleep(50 * time.Millisecond)
	w.Stop()

	if len(sender.sent) == 0 {
		t.Fatal("воркер не отправил напоминания за время работы")
	}
}
