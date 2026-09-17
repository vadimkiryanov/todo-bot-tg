// Строка папки в общем списке заметок (режим «в списке»): тап — вход
// в папку; долгий тач (300 мс, как у строк заметок) или правый клик
// на десктопе — контекстное меню папки (FolderMenu: переименовать/удалить).
// Строка — Cell на компонентах @telegram-apps/telegram-ui: список чата
// (заметки и папки) выглядит одним плоским списком Telegram, как остальные
// списки приложения.
import { Cell } from '@telegram-apps/telegram-ui';

import type { Folder } from '../types/api';
import { useLongPress } from '../utils/longPress';

interface FolderRowProps {
  folder: Folder;
  onOpen: (folder: Folder) => void;
  onMenu?: (folder: Folder, rect: DOMRect) => void;
}

export function FolderRow({ folder, onOpen, onMenu }: FolderRowProps) {
  // Удержание 300 мс — как у строк заметок в этом же списке. Таймер снимается
  // сам: движение > 10 px обрывает удержание, размонтирование (свайп собрал
  // «сцену» и пересоздал список) — очистка хука; на гонку есть проверка
  // el.isConnected.
  const press = useLongPress(
    onMenu === undefined
      ? undefined
      : (el) => {
          onMenu(folder, el.getBoundingClientRect());
        },
  );

  return (
    <Cell
      Component="button"
      type="button"
      // w-full обязателен: <button> в Chromium не растягивается как блочный
      // бокс, а схлопывается по содержимому — короткое имя папки не заняло бы
      // карточку, и область тапа оказалась бы уже карточки.
      className="w-full select-none text-left btn-press-soft [-webkit-touch-callout:none]"
      onClick={() => {
        if (press.skipClick()) return;
        onOpen(folder);
      }}
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onContextMenu={press.onContextMenu}
    >
      <span className="flex min-w-0 items-center gap-2 text-[15px] leading-6">
        {/* Папки в наборе иконок библиотеки нет — строку помечаем словом:
            иначе в общем списке она не отличалась бы от заметки. */}
        <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
          папка
        </span>
        <span className="truncate">{folder.name}</span>
      </span>
    </Cell>
  );
}
