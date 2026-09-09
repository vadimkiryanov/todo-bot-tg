// Экран «🔔 Уведомления» (URL /notifications): журнал сработавших напоминаний
// (серверный). Открытие экрана помечает всё прочитанным; тап по записи —
// открывает заметку «страницей» (если она ещё существует).
import { useEffect, useState } from 'react';

import { EmptyState } from '../components/EmptyState';
import { Loader } from '../components/Loader';
import { NotePage } from '../components/NotePage';
import { getNote } from '../api/notes';
import { loadNotifications, markAllRead, useNotificationsStore } from '../stores/notifications';
import { logout } from '../stores/session';
import type { Note } from '../types/api';
import { firstLineHtml, formatFiredAt } from '../utils/format';
import { navigate } from '../router';

export function NotificationsView() {
  const items = useNotificationsStore((s) => s.items);
  const loading = useNotificationsStore((s) => s.loading);
  const error = useNotificationsStore((s) => s.error);

  // Открытая заметка (по id из уведомления) — объект подгружается с сервера,
  // если её нет в загруженных списках (owner-aware мутации в NotePage).
  const [openedNote, setOpenedNote] = useState<Note | null>(null);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    // Экран открыт — загружаем журнал и помечаем всё прочитанным.
    void loadNotifications().then(() => markAllRead());
  }, []);

  async function openByNotification(noteId: number): Promise<void> {
    if (openError !== '') setOpenError('');
    try {
      setOpenedNote(await getNote(noteId));
    } catch {
      // Заметка удалена после срабатывания — показываем текст снапшота как есть.
      setOpenError('заметка удалена');
    }
  }

  async function doLogout(): Promise<void> {
    await logout();
    navigate('/login');
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-background px-3 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            aria-label="Назад"
            className="flex h-10 w-10 items-center justify-center rounded-full text-lg active:bg-border/50"
            onClick={() => navigate('/')}
          >
            ←
          </button>
          <span className="text-xl">🔔</span>
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
          {loading && items.length === 0 ? (
            <Loader />
          ) : error && items.length === 0 ? (
            <div className="flex flex-col items-center gap-4 px-6 py-16">
              <EmptyState emoji="⚠️" text={error} />
              <button
                type="button"
                className="h-11 rounded-xl border border-border px-6 text-sm"
                onClick={() => void loadNotifications()}
              >
                Повторить
              </button>
            </div>
          ) : items.length === 0 ? (
            <EmptyState emoji="🔕" text="Уведомлений нет" />
          ) : (
            <div className="flex flex-col gap-2 px-3 py-3">
              {openError !== '' && <p className="px-2 text-sm text-destructive">{openError}</p>}
              {items.map((item) => (
                // Непрочитанные визуально выделены точкой у 🔔
                <button
                  key={item.id}
                  type="button"
                  className="glass-card flex w-full touch-manipulation select-none flex-col gap-1 rounded-2xl px-4 py-3 text-left shadow-sm transition-[background-color,transform] active:scale-[0.98] [-webkit-touch-callout:none]"
                  onClick={() => void openByNotification(item.note_id)}
                >
                  <span className="flex min-w-0 items-start gap-2.5">
                    <span className="relative w-5 shrink-0 text-center text-sm leading-6">
                      🔔
                      {!item.read && (
                        <span
                          className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-primary"
                          aria-label="Непрочитано"
                        ></span>
                      )}
                    </span>
                    <span
                      className={`line-clamp-3 min-w-0 flex-1 break-words text-[15px] leading-6 ${
                        item.read ? 'text-muted-foreground' : 'text-foreground'
                      }`}
                      dangerouslySetInnerHTML={{ __html: firstLineHtml(item.text, []) }}
                    />
                  </span>
                  <span className="pl-7 text-xs text-muted-foreground">⏰ {formatFiredAt(item.fired_at)}</span>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>

      {openedNote !== null && (
        <NotePage
          note={openedNote}
          onClose={() => {
            setOpenedNote(null);
          }}
        />
      )}
    </>
  );
}
