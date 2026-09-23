// Экран таймеров (URL /timers): все заметки с установленным напоминанием,
// из любых топиков — как /timers в боте. Каждая строка: галочка выполненной +
// превью + время напоминания и режим («ежедневно» / «один раз»).
// Приоритет — цветная обводка строки (note-priority-*), как в списке заметок.
// Тап по строке — полноэкранная «страница» заметки (NotePage).
// Список — строки-Cell на компонентах @telegram-apps/telegram-ui
// (AppRoot поднят в App.tsx — он задаёт токены --tgui--*).
import { useEffect, useState } from 'react';
import { Button, Cell, IconButton, List, Section } from '@telegram-apps/telegram-ui';
import { Icon16Cancel } from '@telegram-apps/telegram-ui/dist/icons/16/cancel';
import { Icon20Select } from '@telegram-apps/telegram-ui/dist/icons/20/select';
import { Icon24ChevronLeft } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_left';
import { Icon24Notifications } from '@telegram-apps/telegram-ui/dist/icons/24/notifications';
import { Icon24PersonRemove } from '@telegram-apps/telegram-ui/dist/icons/24/person_remove';

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
          {timersLoading ? (
            <Loader />
          ) : timersError ? (
            <div className="flex flex-col items-center gap-4 px-6 py-16">
              <EmptyState icon={<Icon16Cancel />} text={timersError} />
              <Button
                type="button"
                size="s"
                mode="outline"
                className="h-11!"
                onClick={() => void loadTimers()}
              >
                Повторить
              </Button>
            </div>
          ) : timersNotes.length === 0 ? (
            <EmptyState icon={<Icon24Notifications />} text="Таймеров нет" />
          ) : (
            <List>
              <Section>
                {timersNotes.map((note) => (
                  // Тап по строке — страница заметки (там снимают/переносят таймер)
                  <Cell
                    key={note.id}
                    Component="button"
                    type="button"
                    multiline
                    // w-full обязателен: <button> не растягивается как блочный
                    // бокс — короткая строка не заняла бы карточку.
                    className={`w-full select-none text-left touch-manipulation [-webkit-touch-callout:none] ${
                      note.priority === 'high'
                        ? 'note-priority-high'
                        : note.priority === 'medium'
                          ? 'note-priority-medium'
                          : note.priority === 'low'
                            ? 'note-priority-low'
                            : ''
                    }`}
                    before={
                      note.done ? <Icon20Select className="h-5 w-5" /> : undefined
                    }
                    subtitle={`${formatReminderAt(note.reminder_at!, note.reminder_repeat)}${
                      note.reminder_repeat === 'daily' ? ' · ежедневно' : ' · один раз'
                    }`}
                    onClick={() => setSelectedId(note.id)}
                  >
                    <span
                      className={`line-clamp-2 min-w-0 break-words text-[15px] leading-6 ${
                        note.done ? 'text-muted-foreground line-through' : 'text-foreground'
                      }`}
                      dangerouslySetInnerHTML={{ __html: firstLineHtml(note.text, note.entities) }}
                    />
                  </Cell>
                ))}
              </Section>
            </List>
          )}
        </main>
      </div>

      {/* Переход в заметку — сразу в правке (как из чата). */}
      {selectedCache !== null && <NotePage note={selectedCache} startEditing onClose={closePage} />}
    </>
  );
}
