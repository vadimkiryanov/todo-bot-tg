// Папки под табами топиков: дерево всех папок топика (вложенность —
// отступ слева, клик — переход в папку, активная подсвечена).
// Долгий тап по папке — меню (переименовать/удалить); создание папки —
// долгое нажатие на заметке или пустом месте в чате (CreateFolderModal).
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';

import { ConfirmModal } from './ConfirmModal';
import { Modal } from './Modal';
import {
  deleteFolder,
  renameFolder,
  treeFolders,
  useFoldersStore,
} from '../stores/folders';
import { setActiveFolder, useNavigationStore } from '../stores/navigation';
import type { Folder } from '../types/api';

export function FolderBar() {
  const [menuFolder, setMenuFolder] = useState<Folder | null>(null);
  const [menuError, setMenuError] = useState('');
  const [renameMode, setRenameMode] = useState(false);
  const [renameName, setRenameName] = useState('');

  const [showDelete, setShowDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [busy, setBusy] = useState(false);
  const longPressTimer = useRef<number | undefined>(undefined);
  const longPressFired = useRef(false);

  const LONG_PRESS_MS = 500;

  const folders = useFoldersStore((s) => s.all);
  const foldersLoading = useFoldersStore((s) => s.loading);
  const foldersTopicId = useFoldersStore((s) => s.topicId);
  const activeTopicID = useNavigationStore((s) => s.activeTopicID);
  const activeFolderID = useNavigationStore((s) => s.activeFolderID);

  // Дерево всех папок топика: пересобирается при изменении списка папок
  // или активной папки (treeFolders читает стор напрямую).
  const tree = useMemo(() => treeFolders(), [folders, activeFolderID]);

  // Таймер долгого нажатия гасим вместе с жизнью компонента.
  useEffect(
    () => () => {
      window.clearTimeout(longPressTimer.current);
    },
    [],
  );

  function handlePointerDown(id: number): void {
    longPressFired.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      const folder = useFoldersStore.getState().all.find((f) => f.id === id);
      if (folder !== undefined) {
        setRenameMode(false);
        setRenameName(folder.name);
        setMenuError('');
        setMenuFolder(folder);
      }
    }, LONG_PRESS_MS);
  }

  function cancelLongPress(): void {
    window.clearTimeout(longPressTimer.current);
  }

  function onTap(id: number): void {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    setActiveFolder(id);
  }

  function closeMenu(): void {
    setMenuFolder(null);
  }

  async function submitRename(): Promise<void> {
    if (menuFolder === null) return;
    const name = renameName.trim();
    if (name === '') {
      setMenuError('введите название');
      return;
    }
    setBusy(true);
    setMenuError('');
    try {
      await renameFolder(menuFolder.id, name);
      closeMenu();
    } catch (e) {
      setMenuError(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(): Promise<void> {
    if (menuFolder === null) return;
    setBusy(true);
    setDeleteError('');
    try {
      await deleteFolder(menuFolder.id);
      setShowDelete(false);
      closeMenu();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setBusy(false);
    }
  }

  function onRenameInput(e: React.ChangeEvent<HTMLInputElement>): void {
    setRenameName(e.target.value);
  }

  return (
    <>
      <div className="shrink-0 px-3 py-2">
        {foldersLoading && foldersTopicId !== activeTopicID ? (
          <div className="h-10 animate-pulse rounded-full bg-border/40"></div>
        ) : (
          // Дерево всех папок топика: вложенность — отступ слева, клик — переход.
          // Высота не ограничена изнутри — длинное дерево раскрывает шторку до
          // 85dvh, скроллится сама шторка (Modal).
          <div className="tree flex flex-col gap-1">
            <button
              type="button"
              className={`flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm btn-press-soft ${
                activeFolderID === null ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
              }`}
              onClick={() => setActiveFolder(null)}
            >
              📂 Корень
            </button>
            {tree.map((node) => (
              <button
                key={node.folder.id}
                type="button"
                className={`flex h-10 min-w-0 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-foreground btn-press-soft ${
                  node.folder.id === activeFolderID
                    ? 'bg-primary text-white'
                    : 'bg-muted active:bg-border'
                }`}
                style={
                  node.depth > 0 ? { paddingLeft: `${12 + node.depth * 16}px` } : undefined
                }
                onPointerDown={() => handlePointerDown(node.folder.id)}
                onPointerUp={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onClick={() => onTap(node.folder.id)}
              >
                <span className="shrink-0">📁</span>
                <span className="truncate">{node.folder.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {menuFolder !== null && (
        <Modal open onClose={closeMenu}>
          {renameMode ? (
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
                className="input-press h-11 rounded-xl border border-border bg-muted px-4 text-base outline-none focus:border-ring"
                autoFocus
              />
              {menuError !== '' && <p className="text-sm text-destructive">{menuError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-press h-11 flex-1 rounded-xl border border-border text-sm"
                  onClick={() => setRenameMode(false)}
                >
                  Назад
                </button>
                <button
                  type="submit"
                  className="btn-press h-11 flex-1 rounded-xl bg-primary text-sm font-medium text-white disabled:opacity-50"
                  disabled={busy}
                >
                  Сохранить
                </button>
              </div>
            </form>
          ) : (
            <div className="sheet-menu flex flex-col gap-1">
              <h2 className="px-2 pb-2 pt-1 text-lg font-semibold">{menuFolder.name}</h2>
              {menuError !== '' && <p className="px-2 pb-2 text-sm text-destructive">{menuError}</p>}
              <button
                type="button"
                className="btn-press-soft flex h-12 items-center gap-3 rounded-xl px-2 text-base"
                onClick={() => setRenameMode(true)}
              >
                <span>✏️</span> Переименовать
              </button>
              <button
                type="button"
                className="btn-press-soft flex h-12 items-center gap-3 rounded-xl px-2 text-base text-destructive"
                onClick={() => {
                  setDeleteError('');
                  setShowDelete(true);
                }}
              >
                <span>🗑</span> Удалить
              </button>
              <button
                type="button"
                className="btn-press mt-2 h-11 rounded-xl border border-border text-sm"
                onClick={closeMenu}
              >
                Отмена
              </button>
            </div>
          )}
        </Modal>
      )}

      {showDelete && menuFolder !== null && (
        <ConfirmModal
          title="Удалить папку?"
          text="Вместе с папкой удалятся все вложенные папки и заметки"
          busy={busy}
          error={deleteError}
          onClose={() => {
            setShowDelete(false);
            setDeleteError('');
          }}
          onConfirm={() => {
            void doDelete();
          }}
        />
      )}
    </>
  );
}
