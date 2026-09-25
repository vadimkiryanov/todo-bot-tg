// Экран «Уведомления» (URL /notifications): журнал сработавших напоминаний
// (серверный). Открытие экрана помечает всё прочитанным; тап по записи —
// открывает заметку «страницей» (если она ещё существует).
// Список — строки-Cell на компонентах @telegram-apps/telegram-ui: так же, как
// в шторке настроек (AppRoot поднят в App.tsx — он задаёт токены --tgui--*).
import { useEffect, useState } from 'react';
import { Button, Cell, IconButton, List, Section } from '@telegram-apps/telegram-ui';
import { Icon16Cancel } from '@telegram-apps/telegram-ui/dist/icons/16/cancel';
import { Icon24ChevronLeft } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_left';
import { Icon24Notifications } from '@telegram-apps/telegram-ui/dist/icons/24/notifications';
import { Icon24PersonRemove } from '@telegram-apps/telegram-ui/dist/icons/24/person_remove';

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
          <IconButton
            type="button"
            size="m"
            mode="plain"
            aria-label="Назад"
            className="h-10 w-10 items-center justify-center rounded-full! p-0! text-foreground! btn-press"
            onClick={() => navigate('/')}
          >
            <Icon24ChevronLeft />
          </IconButton>
          <Icon24Notifications className="h-6 w-6" />
          <IconButton
            type="button"
            size="m"
            mode="plain"
            aria-label="Выйти"
            className="h-10 w-10 items-center justify-center rounded-full! p-0! btn-press"
            onClick={() => void doLogout()}
          >
            <Icon24PersonRemove />
          </IconButton>
        </header>

        <main className="scroll-area flex-1 overflow-y-auto">
          {loading && items.length === 0 ? (
            <Loader />
          ) : error && items.length === 0 ? (
            <div className="flex flex-col items-center gap-4 px-6 py-16">
              <EmptyState icon={<Icon16Cancel />} text={error} />
              <Button
                type="button"
                size="s"
                mode="outline"
                className="h-11! btn-press-wide"
                onClick={() => void loadNotifications()}
              >
                Повторить
              </Button>
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={<Icon24Notifications />} text="Уведомлений нет" />
          ) : (
            <>
              {openError !== '' && (
                <p className="px-4 pt-3 text-sm text-destructive">{openError}</p>
              )}
              <List>
                <Section>
                  {items.map((item) => (
                    // Непрочитанные визуально выделены точкой у колокольчика
                    // w-full обязателен: <button> не растягивается как блочный
                    // бокс — короткое уведомление не заняло бы карточку.
                    <Cell
                      key={item.id}
                      Component="button"
                      type="button"
                      multiline
                      className="w-full select-none text-left touch-manipulation [-webkit-touch-callout:none] btn-press-soft"
                      before={
                        <span className="relative flex h-5 w-5 items-center justify-center">
                          {/* viewBox: у иконок набора его нет, и без него
                              уменьшение размера не масштабирует рисунок,
                              а режет его по краю бокса. */}
                          <Icon24Notifications viewBox="0 0 24 24" className="h-5 w-5" />
                          {!item.read && (
                            <span
                              className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-primary"
                              aria-label="Непрочитано"
                            ></span>
                          )}
                        </span>
                      }
                      subtitle={`сработало ${formatFiredAt(item.fired_at)}`}
                      onClick={() => void openByNotification(item.note_id)}
                    >
                      <span
                        className={`line-clamp-3 min-w-0 break-words text-[15px] leading-6 ${
                          item.read ? 'text-muted-foreground' : 'text-foreground'
                        }`}
                        dangerouslySetInnerHTML={{ __html: firstLineHtml(item.text, []) }}
                      />
                    </Cell>
                  ))}
                </Section>
              </List>
            </>
          )}
        </main>
      </div>

      {openedNote !== null && (
        <NotePage
          note={openedNote}
          // Переход из журнала — тот же переход в заметку: сразу в правке.
          startEditing
          onClose={() => {
            setOpenedNote(null);
          }}
        />
      )}
    </>
  );
}
