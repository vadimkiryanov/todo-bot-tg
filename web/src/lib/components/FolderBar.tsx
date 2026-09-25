// Дерево всех папок топика (шторка «Папки») на компонентах
// @telegram-apps/telegram-ui: тап — переход в папку, вложенность — отступом
// всего ряда слева, активная папка помечена галочкой; долгий тач (правый
// клик) — меню папки (переименовать/удалить). Создание папки — долгое
// нажатие на заметке или пустом месте в чате (CreateFolderModal).
// Форма переименования и «Отмена» — тоже библиотечные Button/Input
// (Input с bg-muted!: библиотечная заливка совпадает с фоном шторки).
// «Отмена» под списком лежит в блочном div, а не в flex-колонке, поэтому
// w-full у неё обязателен: <button> схлопывается по содержимому.
import { useMemo, useState } from 'react';
import { Button, Cell, Input, List, Section } from '@telegram-apps/telegram-ui';
import { Icon20Select } from '@telegram-apps/telegram-ui/dist/icons/20/select';
import { Icon28Edit } from '@telegram-apps/telegram-ui/dist/icons/28/edit';

import { ConfirmModal } from './ConfirmModal';
import { FolderIcon } from './FolderIcon';
import { MenuRow } from './MenuRow';
import { Modal } from './Modal';
import {
  deleteFolder,
  renameFolder,
  treeFolders,
  useFoldersStore,
} from '../stores/folders';
import { setActiveFolder, useNavigationStore } from '../stores/navigation';
import type { Folder } from '../types/api';
import { useLongPress } from '../utils/longPress';

/** Удержание — как у табов островка (не короче): тап входит в папку,
    меню открывается сознательным удержанием. */
const HOLD_MS = 500;

interface FolderCellProps {
  name: string;
  /** Глубина вложенности (0 — корень топика): ряд сдвигается вправо. */
  depth: number;
  active: boolean;
  onClick: () => void;
  /** Долгий тач/правый клик — меню папки (у строки «Корень» его нет). */
  onMenu?: () => void;
}

function FolderCell({ name, depth, active, onClick, onMenu }: FolderCellProps) {
  const press = useLongPress(onMenu, HOLD_MS);

  return (
    <Cell
      Component="button"
      type="button"
      // w-full обязателен: <button> в Chromium не растягивается как блочный
      // бокс, а схлопывается по содержимому — короткое имя папки не заняло бы
      // карточку, и галочка встала бы сразу за подписью.
      className="w-full select-none text-left btn-press-soft [-webkit-touch-callout:none]"
      // Вложенность — отступом всего ряда (имя сдвигается, как в дереве):
      // класс Cell задаёт padding 0 16px, inline-стиль перебивает левую часть.
      style={depth > 0 ? { paddingLeft: `${16 + depth * 16}px` } : undefined}
      after={active ? <Icon20Select className="text-ring" /> : undefined}
      onClick={() => {
        if (press.skipClick()) return;
        onClick();
      }}
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onContextMenu={press.onContextMenu}
    >
      <span className="flex min-w-0 items-center gap-2 text-[15px] leading-6">
        {/* Иконка папки: у строки «Корень» она отличает уровень топика от
            самих папок ниже. */}
        <span className="shrink-0 text-muted-foreground">
          <FolderIcon />
        </span>
        <span className="truncate">{name}</span>
      </span>
    </Cell>
  );
}

export function FolderBar() {
  const [menuFolder, setMenuFolder] = useState<Folder | null>(null);
  const [menuError, setMenuError] = useState('');
  const [renameMode, setRenameMode] = useState(false);
  const [renameName, setRenameName] = useState('');

  const [showDelete, setShowDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [busy, setBusy] = useState(false);

  const folders = useFoldersStore((s) => s.all);
  const foldersLoading = useFoldersStore((s) => s.loading);
  const foldersTopicId = useFoldersStore((s) => s.topicId);
  const activeTopicID = useNavigationStore((s) => s.activeTopicID);
  const activeFolderID = useNavigationStore((s) => s.activeFolderID);

  // Дерево всех папок топика: пересобирается при изменении списка папок
  // или активной папки (treeFolders читает стор напрямую).
  const tree = useMemo(() => treeFolders(), [folders, activeFolderID]);

  function openFolderMenu(folder: Folder): void {
    setRenameMode(false);
    setRenameName(folder.name);
    setMenuError('');
    setMenuFolder(folder);
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
      {foldersLoading && foldersTopicId !== activeTopicID ? (
        <div className="h-16 animate-pulse rounded-xl bg-border/40"></div>
      ) : (
        // px-0! — снимаем собственные отступы List (10px 18px на iOS):
        // горизонтальные отступы задаёт шторка, иначе карточка-секция уезжает
        // к центру и становится узкой (как в шторке настроек).
        <List className="px-0!">
          <Section>
            <FolderCell
              name="Корень"
              depth={0}
              active={activeFolderID === null}
              onClick={() => setActiveFolder(null)}
            />
            {tree.map((node) => (
              <FolderCell
                key={node.folder.id}
                name={node.folder.name}
                depth={node.depth}
                active={node.folder.id === activeFolderID}
                onClick={() => setActiveFolder(node.folder.id)}
                onMenu={() => openFolderMenu(node.folder)}
              />
            ))}
          </Section>
        </List>
      )}

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
              <Input
                type="text"
                value={renameName}
                onChange={onRenameInput}
                maxLength={64}
                className="bg-muted! input-press"
                autoFocus
              />
              {menuError !== '' && <p className="text-sm text-destructive">{menuError}</p>}
              <div className="flex gap-2">
                <Button
                  type="button"
                  mode="outline"
                  className="h-11! flex-1 btn-press-wide"
                  onClick={() => setRenameMode(false)}
                >
                  Назад
                </Button>
                <Button
                  type="submit"
                  mode="filled"
                  className="h-11! flex-1 disabled:opacity-50 btn-press-wide"
                  disabled={busy}
                >
                  Сохранить
                </Button>
              </div>
            </form>
          ) : (
            <div role="menu">
              <h2 className="px-2 pb-2 text-lg font-semibold">{menuFolder.name}</h2>
              {menuError !== '' && <p className="px-2 pb-2 text-sm text-destructive">{menuError}</p>}
              <List className="px-0! py-0!">
                <Section>
                  <MenuRow icon={<Icon28Edit />} onSelect={() => setRenameMode(true)}>
                    Переименовать
                  </MenuRow>
                  <MenuRow
                    danger
                    onSelect={() => {
                      setDeleteError('');
                      setShowDelete(true);
                    }}
                  >
                    Удалить
                  </MenuRow>
                </Section>
              </List>
              <Button
                type="button"
                mode="outline"
                className="mt-2 h-11! w-full btn-press-wide"
                onClick={closeMenu}
              >
                Отмена
              </Button>
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
