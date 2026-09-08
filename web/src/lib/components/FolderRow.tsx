// Строка папки в общем списке заметок (режим «в списке»): тап — вход
// в папку; долгий тач (300 мс, как у карточек заметок) или правый клик
// на десктопе — контекстное меню папки (FolderMenu: переименовать/удалить).
import { useEffect, useRef } from 'react';
import type * as React from 'react';

import type { Folder } from '../types/api';
import { suppressNextClick } from '../utils/click';

interface FolderRowProps {
  folder: Folder;
  onOpen: (folder: Folder) => void;
  onMenu?: (folder: Folder, rect: DOMRect) => void;
}

export function FolderRow({ folder, onOpen, onMenu }: FolderRowProps) {
  // ── Долгий тач ──────────────────────────────────────────────
  // Удержание 300 мс без движения >10px открывает меню и подавляет
  // следующий клик (иначе вместе с меню произойдёт и вход в папку).
  const LONG_PRESS_MS = 300;
  const MOVE_THRESHOLD = 10;

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);

  function clearPressTimer(): void {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  // Горизонтальный свайп раскладывает список в «сцену» — строка под пальцем
  // размонтируется (и пересоздаётся в панели сцены). Её таймер долгого нажатия
  // иначе дожил бы до конца и открыл меню посреди свайпа: pointermove на
  // размонтированном элементе уже не приходит, движение таймер не сбрасывает.
  // Гасим таймер вместе с жизнью строки; на случай гонки (таймер уже в очереди)
  // проверяем, что строка ещё в документе.
  useEffect(
    () => () => {
      clearPressTimer();
    },
    [],
  );

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>): void {
    if (e.button !== 0) return;
    // Мобильный браузер при удержании пальца начинает выделять текст —
    // сбрасываем выделение, чтобы долгий тап не выделял соседние элементы.
    window.getSelection()?.removeAllRanges();
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
    // Элемент захватываем сразу: внутри setTimeout у события currentTarget уже null.
    const el = e.currentTarget;
    startX.current = e.clientX;
    startY.current = e.clientY;
    longPressTriggered.current = false;
    clearPressTimer();
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      // Строку размонтировали (свайп собрал сцену, список сменился) — меню
      // не открываем: таймер мог сработать раньше, чем unmount-очистка его сняла.
      if (!el.isConnected) return;
      longPressTriggered.current = true;
      suppressNextClick();
      onMenu?.(folder, el.getBoundingClientRect());
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>): void {
    if (pressTimer.current === null) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
      clearPressTimer();
    }
  }

  function onPointerUp(): void {
    clearPressTimer();
    if (longPressTriggered.current) {
      // iOS после долгого тапа может оставить выделение — снимаем его.
      window.getSelection()?.removeAllRanges();
    }
  }

  function onPointerCancel(): void {
    clearPressTimer();
  }

  function onRowClick(): void {
    if (longPressTriggered.current) {
      // Клик после долгого тача: меню уже открыто, в папку не входим.
      longPressTriggered.current = false;
      return;
    }
    onOpen(folder);
  }

  // Android Chrome генерирует contextmenu при долгом таче; на десктопе
  // правый клик открывает то же меню.
  function onContextMenu(e: React.MouseEvent<HTMLButtonElement>): void {
    e.preventDefault();
    if (longPressTriggered.current) return;
    onMenu?.(folder, e.currentTarget.getBoundingClientRect());
  }

  return (
    <button
      type="button"
      className="glass-card flex w-full touch-manipulation select-none items-center gap-2.5 rounded-2xl px-4 py-3 text-left shadow-sm transition-[background-color,transform] active:scale-[0.98] [-webkit-touch-callout:none]"
      onClick={onRowClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
    >
      <span className="w-5 shrink-0 text-center text-sm leading-6">📁</span>
      <span className="min-w-0 flex-1 truncate text-[15px] leading-6 text-content">
        {folder.name}
      </span>
    </button>
  );
}
