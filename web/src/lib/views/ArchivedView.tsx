// Экран архива (URL /archive): заметки из всех топиков.
// Открытие заметки — полноэкранная «страница» (NotePage): вернуть из архива /
// удалить. Возврат на главный экран — стрелка в шапке.
// Список — строки-Cell на компонентах @telegram-apps/telegram-ui
// (AppRoot поднят в App.tsx — он задаёт токены --tgui--*).
import { useEffect, useMemo, useState } from 'react';
import { Button, IconButton, List, Section } from '@telegram-apps/telegram-ui';
import { Icon16Cancel } from '@telegram-apps/telegram-ui/dist/icons/16/cancel';
import { Icon24ChevronLeft } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_left';
import { Icon24PersonRemove } from '@telegram-apps/telegram-ui/dist/icons/24/person_remove';
import { Icon28Archive } from '@telegram-apps/telegram-ui/dist/icons/28/archive';

import { EmptyState } from '../components/EmptyState';
import { Loader } from '../components/Loader';
import { NoteCell } from '../components/NoteCell';
import { NoteMenu } from '../components/NoteMenu';
import { NotePage } from '../components/NotePage';
import { loadArchived, useNotesStore } from '../stores/notes';
import { logout } from '../stores/session';
import type { Note } from '../types/api';
import { navigate } from '../router';

export function ArchivedView() {
  const archivedNotes = useNotesStore((s) => s.archivedNotes);
  const archivedLoading = useNotesStore((s) => s.archivedLoading);
  const archivedError = useNotesStore((s) => s.archivedError);

  // Открытая заметка: кэш объекта — заметка может исчезнуть из списка
  // (вернуть из архива/удалить) раньше, чем доиграет закрытие страницы.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedCache, setSelectedCache] = useState<Note | null>(null);
  useEffect(() => {
    if (selectedId === null) {
      setSelectedCache(null);
      return;
    }
    const found = archivedNotes.find((n) => n.id === selectedId);
    if (found) setSelectedCache(found);
  }, [selectedId, archivedNotes]);

  // Дропдаун-меню (долгий тач по карточке): заметка + позиция карточки в момент открытия.
  const [menuNoteId, setMenuNoteId] = useState<number | null>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const menuNote = useMemo(
    () => menuNoteId === null ? null : archivedNotes.find((n) => n.id === menuNoteId) ?? null,
    [menuNoteId, archivedNotes],
  );

  function openMenu(note: Note, rect: DOMRect): void {
    setMenuNoteId(note.id);
    setMenuRect(rect);
  }

  function closeMenu(): void {
    setMenuNoteId(null);
    setMenuRect(null);
  }

  function closePage(): void {
    setSelectedId(null);
  }

  useEffect(() => {
    void loadArchived();
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
          <Icon28Archive viewBox="0 0 28 28" className="h-6 w-6" />
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
          {archivedLoading ? (
            <Loader />
          ) : archivedError ? (
            <div className="flex flex-col items-center gap-4 px-6 py-16">
              <EmptyState icon={<Icon16Cancel />} text={archivedError} />
              <Button
                type="button"
                size="s"
                mode="outline"
                className="h-11! btn-press-wide"
                onClick={() => void loadArchived()}
              >
                Повторить
              </Button>
            </div>
          ) : archivedNotes.length === 0 ? (
            <EmptyState icon={<Icon28Archive />} text="Архив пуст" />
          ) : (
            <List>
              <Section>
                {archivedNotes.map((note) => (
                  <NoteCell
                    key={note.id}
                    note={note}
                    onOpen={(n) => setSelectedId(n.id)}
                    onMenu={openMenu}
                  />
                ))}
              </Section>
            </List>
          )}
        </main>
      </div>

      {selectedCache !== null && <NotePage note={selectedCache} onClose={closePage} />}

      {menuNote !== null && menuRect !== null && (
        <NoteMenu note={menuNote} rect={menuRect} archived onClose={closeMenu} />
      )}
    </>
  );
}
