// Экран «⏰ Таймеры» (URL /timers): все заметки с установленным напоминанием,
// из любых топиков — как /timers в боте. Каждая строка: ✅ выполненной +
// превью + время напоминания и режим (🔂 разовый / 🔁 ежедневный).
// Приоритет — цветная обводка строки (note-priority-*), как в списке заметок.
// Тап по строке — полноэкранная «страница» заметки (NotePage).
import { useEffect, useState } from 'react';

import { EmptyState } from '../components/EmptyState';
import { Loader } from '../components/Loader';
import { NotePage } from '../components/NotePage';
import { loadTimers, useNotesStore } from '../stores/notes';
import { logout } from '../stores/session';
import type { Note } from '../types/api';
import { firstLineHtml, formatReminderAt } from '../utils/format';
import { navigate } from '../router';

export function TimersView() {
  const timersNotes = useNotesStore((s) => s.timersNotes);
  const timersLoading = useNotesStore((s) => s.timersLoading);
  const timersError = useNotesStore((s) => s.timersError);

  // Открытая заметка: кэш объекта — заметка может исчезнуть из списка
  // (таймер снят/выполнена/удалена) раньше, чем доиграет закрытие страницы.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedCache, setSelectedCache] = useState<Note | null>(null);
  useEffect(() => {
    if (selectedId === null) {
      setSelectedCache(null);
      return;
    }
    const found = timersNotes.find((n) => n.id === selectedId);
    if (found) setSelectedCache(found);
  }, [selectedId, timersNotes]);

  function closePage(): void {
    setSelectedId(null);
  }

  useEffect(() => {
    void loadTimers();
  }, []);

  async function doLogout(): Promise<void> {
    await logout();
    navigate('/login');
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-3 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            aria-label="Назад"
            className="flex h-10 w-10 items-center justify-center rounded-full text-lg active:bg-border/50"
            onClick={() => navigate('/')}
          >
            ←
          </button>
          <span className="text-xl">⏰</span>
          <button
            type="button"
            aria-label="Выйти"
            className="flex h-10 w-10 items-center justify-center rounded-full text-lg active:bg-border/50"
            onClick={() => void doLogout()}
          >
            🚪
          </button>
        </header>

        <main className="scroll-area flex-1 overflow-y-auto">
          {timersLoading ? (
            <Loader />
          ) : timersError ? (
            <div className="flex flex-col items-center gap-4 px-6 py-16">
              <EmptyState emoji="⚠️" text={timersError} />
              <button
                type="button"
                className="h-11 rounded-xl border border-border px-6 text-sm"
                onClick={() => void loadTimers()}
              >
                Повторить
              </button>
            </div>
          ) : timersNotes.length === 0 ? (
            <EmptyState emoji="⏰" text="Таймеров нет" />
          ) : (
            <div className="flex flex-col gap-2 px-3 py-3">
              {timersNotes.map((note) => (
                // Тап по строке — страница заметки (там снимают/переносят таймер)
                <button
                  key={note.id}
                  type="button"
                  className={`glass-card flex w-full touch-manipulation select-none flex-col gap-1 rounded-2xl px-4 py-3 text-left shadow-sm transition-[background-color,transform] active:scale-[0.98] [-webkit-touch-callout:none] ${
                    note.priority === 'high'
                      ? 'note-priority-high'
                      : note.priority === 'medium'
                        ? 'note-priority-medium'
                        : note.priority === 'low'
                          ? 'note-priority-low'
                          : ''
                  }`}
                  onClick={() => setSelectedId(note.id)}
                >
                  <span className="flex min-w-0 items-start gap-2.5">
                    {note.done && <span className="w-5 shrink-0 text-center text-sm leading-6">✅</span>}
                    <span
                      className={`line-clamp-2 min-w-0 flex-1 break-words text-[15px] leading-6 ${
                        note.done ? 'text-muted line-through' : 'text-content'
                      }`}
                      dangerouslySetInnerHTML={{ __html: firstLineHtml(note.text, note.entities) }}
                    />
                  </span>
                  <span className="pl-7 text-xs text-muted">
                    ⏰ {formatReminderAt(note.reminder_at!, note.reminder_repeat)}
                    {note.reminder_repeat === 'daily' ? '· 🔁 ежедневно' : '· 🔂 один раз'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>

      {selectedCache !== null && <NotePage note={selectedCache} onClose={closePage} />}
    </>
  );
}
