// Экран архива (URL /archive): заметки из всех топиков.
// Открытие заметки — полноэкранная «страница» (NotePage): вернуть из архива /
// удалить. Возврат на главный экран — стрелка в шапке.
import { useEffect, useMemo, useState } from 'react';

import { EmptyState } from '../components/EmptyState';
import { Loader } from '../components/Loader';
import { NoteCard } from '../components/NoteCard';
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
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-3 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            aria-label="Назад"
            className="flex h-10 w-10 items-center justify-center rounded-full text-lg active:bg-border/50"
            onClick={() => navigate('/')}
          >
            ←
          </button>
          <span className="text-xl">🗄</span>
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
          {archivedLoading ? (
            <Loader />
          ) : archivedError ? (
            <div className="flex flex-col items-center gap-4 px-6 py-16">
              <EmptyState emoji="⚠️" text={archivedError} />
              <button
                type="button"
                className="h-11 rounded-xl border border-border px-6 text-sm"
                onClick={() => void loadArchived()}
              >
                Повторить
              </button>
            </div>
          ) : archivedNotes.length === 0 ? (
            <EmptyState emoji="🗄" text="Архив пуст" />
          ) : (
            <div className="flex flex-col gap-2 px-3 py-3">
              {archivedNotes.map((note) => (
                <NoteCard key={note.id} note={note} onOpen={(n) => setSelectedId(n.id)} onMenu={openMenu} />
              ))}
            </div>
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
