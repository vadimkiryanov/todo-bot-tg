// Контекстное меню строки папки в списке заметок (режим «в списке»):
// дропдаун у карточки, как у заметок (NoteMenu) — тот же набор действий,
// что в меню папки в дереве: переименовать/удалить. Переименование — форма
// в шторке (Modal), удаление — с подтверждением (ConfirmModal).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type * as React from 'react';

import { ConfirmModal } from './ConfirmModal';
import { Modal } from './Modal';
import { deleteFolder, renameFolder } from '../stores/folders';
import type { Folder } from '../types/api';
import { lockScroll, unlockScroll } from '../utils/scroll';

interface FolderMenuProps {
  folder: Folder;
  rect: DOMRect;
  onClose: () => void;
}

export function FolderMenu({ folder, rect, onClose }: FolderMenuProps) {
  const [mode, setMode] = useState<'menu' | 'rename'>('menu');
  // Черновик названия: заполняется при открытии формы переименования.
  const [renameName, setRenameName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Позиция: под карточкой; если меню выше доступного места снизу — над ней.
  const menuEl = useRef<HTMLDivElement | null>(null);
  const [openUp, setOpenUp] = useState(false);

  const pos = (() => {
    const width = Math.min(Math.max(rect.width, 240), 336);
    return {
      width,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: rect.bottom + 6,
      bottom: Math.max(8, window.innerHeight - rect.top + 6),
    };
  })();

  useLayoutEffect(() => {
    const el = menuEl.current;
    if (el === null) return; // меню не отрисовано (модалка/подтверждение)
    const below = window.innerHeight - rect.bottom - 6;
    setOpenUp(el.offsetHeight > below);
  }, [rect, mode, confirmDelete]);

  // Пока меню открыто — скролл списка заморожен (как у меню заметки):
  // жест скролла не должен прятать меню.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    lockScroll();
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeydown);
    return () => {
      unlockScroll();
      window.removeEventListener('keydown', onKeydown);
    };
  }, []);

  function openRename(): void {
    setRenameName(folder.name);
    setError('');
    setMode('rename');
  }

  async function submitRename(): Promise<void> {
    const name = renameName.trim();
    if (name === '') {
      setError('введите название');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await renameFolder(folder.id, name);
      onCloseRef.current();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await deleteFolder(folder.id);
      onCloseRef.current();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setBusy(false);
    }
  }

  function onRenameInput(e: React.ChangeEvent<HTMLInputElement>): void {
    setRenameName(e.target.value);
  }

  if (confirmDelete) {
    return (
      <ConfirmModal
        title="Удалить папку?"
        text="Вместе с папкой удалятся все вложенные папки и заметки"
        busy={busy}
        error={error}
        onClose={() => {
          setConfirmDelete(false);
          setError('');
        }}
        onConfirm={() => {
          void doDelete();
        }}
      />
    );
  }

  if (mode === 'rename') {
    return (
      <Modal open onClose={onClose}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submitRename();
          }}
        >
          <h2 className="text-lg font-semibold">Переименовать</h2>
          <input
            type="text"
            value={renameName}
            onChange={onRenameInput}
            maxLength={64}
            className="h-11 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent"
            autoFocus
          />
          {error !== '' && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              className="h-11 flex-1 rounded-xl border border-border text-sm"
              onClick={() => {
                setMode('menu');
                setError('');
              }}
            >
              Назад
            </button>
            <button
              type="submit"
              className="h-11 flex-1 rounded-xl bg-accent-strong text-sm font-medium text-white disabled:opacity-50"
              disabled={busy}
            >
              Сохранить
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <>
      {/* Затемнённый фон: тап по нему — закрыть меню */}
      <div
        className="backdrop-glass backdrop-anim fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      ></div>

      <div
        ref={menuEl}
        className="glass-menu menu-anim fixed z-50 flex flex-col gap-1 rounded-2xl p-2 shadow-xl"
        style={{
          left: `${pos.left}px`,
          width: `${pos.width}px`,
          top: openUp ? undefined : `${pos.top}px`,
          bottom: openUp ? `${pos.bottom}px` : undefined,
        }}
        role="menu"
      >
        {error !== '' && <p className="px-3 py-1 text-xs text-danger">{error}</p>}
        <button
          type="button"
          role="menuitem"
          className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left transition-colors active:bg-border/50"
          onClick={openRename}
        >
          <span className="w-6 shrink-0 text-center text-base">✏️</span>
          Переименовать
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left text-danger transition-colors active:bg-border/50"
          onClick={() => {
            setError('');
            setConfirmDelete(true);
          }}
        >
          <span className="w-6 shrink-0 text-center text-base">🗑</span>
          Удалить
        </button>
      </div>
    </>
  );
}
