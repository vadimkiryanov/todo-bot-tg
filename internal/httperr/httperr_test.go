package httperr

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	errs "todo-bot-tg/internal/errors"
)

func TestStatus(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"не найдено", errs.ErrNotFound, http.StatusNotFound},
		{"топик не найден", errs.ErrTopicNotFound, http.StatusNotFound},
		{"заметка не найдена", errs.ErrNoteNotFound, http.StatusNotFound},
		{"папка не найдена", errs.ErrFolderNotFound, http.StatusNotFound},
		{"вложение не найдено", errs.ErrAttachmentNotFound, http.StatusNotFound},
		{"настройки не найдены", errs.ErrSettingsNotFound, http.StatusNotFound},
		{"топик уже существует", errs.ErrTopicAlreadyExists, http.StatusConflict},
		{"папка уже существует", errs.ErrFolderAlreadyExists, http.StatusConflict},
		{"пустой текст", errs.ErrEmptyText, http.StatusBadRequest},
		{"пустое имя", errs.ErrEmptyName, http.StatusBadRequest},
		{"некорректный приоритет", errs.ErrInvalidPriority, http.StatusBadRequest},
		{"некорректный повтор напоминания", errs.ErrInvalidReminderRepeat, http.StatusBadRequest},
		{"неизвестная ошибка", errors.New("boom"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Status(tc.err); got != tc.want {
				t.Errorf("Status(%v) = %d, want %d", tc.err, got, tc.want)
			}
		})
	}
}

func TestWrite_JSONFormat(t *testing.T) {
	rec := httptest.NewRecorder()
	Write(rec, errs.ErrNoteNotFound)

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type = %q, want prefix application/json", ct)
	}
	want := `{"error":"заметка не найдена"}`
	if got := strings.TrimSpace(rec.Body.String()); got != want {
		t.Errorf("body = %q, want %q", got, want)
	}
}

func TestWrite_Internal_HidesDetails(t *testing.T) {
	rec := httptest.NewRecorder()
	Write(rec, ErrInternal)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusInternalServerError)
	}
	if want := `{"error":"внутренняя ошибка сервера"}`; strings.TrimSpace(rec.Body.String()) != want {
		t.Errorf("body = %q, want %q", rec.Body.String(), want)
	}
}
