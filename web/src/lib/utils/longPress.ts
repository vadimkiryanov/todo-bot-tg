// Долгий тач по строке списка: удержание 300 мс без движения больше 10 px
// открывает меню действий и подавляет следующий клик — иначе вместе с меню
// открылся бы и оверлей заметки. Правый клик на десктопе и contextmenu от
// долгого тача в Android Chrome открывают то же меню.
// Живёт отдельно от разметки: строки — Cell на компонентах telegram-ui
// (NoteCell, FolderRow, строки шторок).
import { useEffect, useRef } from 'react';
import type * as React from 'react';

import { suppressNextClick } from './click';

const LONG_PRESS_MS = 300;
const MOVE_THRESHOLD = 10;

export interface LongPress {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onContextMenu: (e: React.MouseEvent<HTMLElement>) => void;
  /** Клик пришёл сразу после долгого тача: меню уже открыто — клик пропускаем. */
  skipClick: () => boolean;
}

/**
 * Обработчики удержания для строки-кнопки. onTrigger получает саму строку —
 * меню позиционируется по её прямоугольнику в момент открытия.
 * holdMs — своя длительность удержания там, где жест соседствует с другим
 * (табы островка: 500 мс, чтобы свайп ленты не открывал меню случайно).
 */
export function useLongPress(
  onTrigger?: (el: HTMLElement) => void,
  holdMs: number = LONG_PRESS_MS,
): LongPress {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);

  function clear(): void {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  // Строку могли размонтировать (список пересобрался, свайп собрал «сцену»):
  // таймер не должен дожить до конца и открыть меню из ниоткуда.
  useEffect(() => () => clear(), []);

  function onPointerDown(e: React.PointerEvent<HTMLElement>): void {
    if (e.button !== 0) return;
    // Мобильный браузер при удержании пальца начинает выделять текст —
    // сбрасываем выделение и фокус, чтобы долгий тап не выделял контент.
    window.getSelection()?.removeAllRanges();
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
    // Элемент запоминаем сразу: внутри setTimeout у события currentTarget уже null.
    const el = e.currentTarget;
    startX.current = e.clientX;
    startY.current = e.clientY;
    fired.current = false;
    clear();
    timer.current = setTimeout(() => {
      timer.current = null;
      // Строку размонтировали — меню не открываем: таймер мог сработать
      // раньше, чем очистка при размонтировании его сняла.
      if (!el.isConnected) return;
      fired.current = true;
      suppressNextClick();
      onTrigger?.(el);
    }, holdMs);
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>): void {
    if (timer.current === null) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
      clear();
    }
  }

  function onPointerUp(): void {
    clear();
    if (fired.current) {
      // iOS после долгого тапа может оставить выделение — снимаем его.
      window.getSelection()?.removeAllRanges();
    }
  }

  function onContextMenu(e: React.MouseEvent<HTMLElement>): void {
    e.preventDefault();
    if (fired.current) return;
    onTrigger?.(e.currentTarget);
  }

  function skipClick(): boolean {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: clear,
    onContextMenu,
    skipClick,
  };
}
