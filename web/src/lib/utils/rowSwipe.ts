// Свайп строки заметки справа налево: строка уезжает влево, и из-за её
// правого края выходят кнопки действий («выполнить», «закрепить»).
//
// Захват — только у правого края строки (ROW_SWIPE_ZONE): остальная площадь
// принадлежит ленте топиков, которая листает слайды горизонтальным свайпом по
// всему списку. Лента уступает жест строке сама — по этой же проверке в своём
// watchDrag (startsRowSwipe ниже), поэтому два горизонтальных жеста не спорят
// между собой. Исключение — уже открытая строка: она забрана целиком, и свайп
// по ней (по карточке или по кнопкам) возвращает её на место, а не листает
// топики; чтобы жест не достался обоим, лента и здесь спрашивает
// startsRowSwipe.
//
// Смещение строки пишем прямо в DOM (transform слоя), а не через состояние
// React: кадры жеста не должны перерисовывать содержимое строки. В состояние
// уходит только итог — открыта строка или нет.
import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import type { RefObject } from 'react';

import { suppressNextClick } from './click';

/** Зона захвата у правого края строки. */
export const ROW_SWIPE_ZONE = 44;
/** Сторона квадратной кнопки действий. */
const ROW_SWIPE_BUTTON = 44;
/** Просвет между строкой и первой кнопкой и между кнопками. */
const ROW_SWIPE_GAP = 8;
/** Ход строки при открытии/возврате. */
const ROW_SWIPE_MS = 200;
const ROW_SWIPE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** Смещение пальца, после которого жест считается свайпом, а не тапом. */
const DRAG_START = 8;

/** Открытая строка одна на весь веб: её элемент — чтобы лента топиков знала,
    кому принадлежит жест, и её «вернуть на место». Метка строки отличает свою
    запись от чужих: ссылка на close для этого не годится — close пересоздаётся
    на каждом рендере, а рендера сразу после открытия не миновать. */
let openedRow: { el: HTMLElement; owner: object; close: () => void } | null = null;

/** Ширина полосы кнопок: сами кнопки с просветами (отступ от строки — первый). */
export function rowSwipeWidth(buttons: number): number {
  if (buttons <= 0) return 0;
  return buttons * ROW_SWIPE_BUTTON + buttons * ROW_SWIPE_GAP;
}

/**
 * Жест начинается на строке заметки? Открытая строка забирает жест по всей
 * своей площади — свайпом по ней её возвращают на место. У закрытой строки
 * берём только правый край (зона ROW_SWIPE_ZONE): остальная площадь отдана
 * ленте топиков. Лента спрашивает это в своём watchDrag и такой жест себе не
 * берёт.
 */
export function startsRowSwipe(evt: TouchEvent | MouseEvent): boolean {
  const target = evt.target;
  if (!(target instanceof Element)) return false;
  if (openedRow !== null && openedRow.el.contains(target)) return true;
  const row = target.closest('[data-row-swipe]');
  if (row === null) return false;
  const x = 'touches' in evt ? (evt.touches[0]?.clientX ?? null) : evt.clientX;
  if (x === null) return false;
  return x >= row.getBoundingClientRect().right - ROW_SWIPE_ZONE;
}

export interface RowSwipe {
  /** Обёртка строки: обрезает полосу кнопок, держит точку отсчёта жеста. */
  rootRef: RefObject<HTMLDivElement | null>;
  /** Слой, который уезжает влево, — строка вместе с полосой кнопок. */
  slideRef: RefObject<HTMLDivElement | null>;
  /** Строка отодвинута, кнопки открыты. */
  opened: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** Вернуть строку на место (действие полосы, тап по строке, тап мимо). */
  close: () => void;
}

/**
 * Жест «отодвинуть строку» для строки заметки. width — ширина полосы кнопок
 * (rowSwipeWidth); 0 — действий нет, строка не свайпается.
 */
export function useRowSwipe(width: number): RowSwipe {
  const rootRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState(false);

  // Смещение и «открытость» читаем из ref'ов: обработчики жеста живут на
  // window и к моменту вызова могут быть из прошлого рендера.
  const offsetRef = useRef(0);
  const openedRef = useRef(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  const closeRef = useRef<() => void>(() => {});
  const detachRef = useRef<(() => void) | null>(null);
  /** Метка этой строки: по ней строка узнаёт свою запись среди открытых. */
  const ownerRef = useRef({});

  /** Смещение в DOM: жесту не нужен ре-рендер на каждый кадр. */
  function apply(offset: number, animate: boolean): void {
    offsetRef.current = offset;
    const el = slideRef.current;
    if (el === null) return;
    const motion =
      animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.style.transition = motion ? `transform ${ROW_SWIPE_MS}ms ${ROW_SWIPE_EASE}` : 'none';
    el.style.transform = offset === 0 ? '' : `translate3d(${-offset}px, 0, 0)`;
  }

  /** Своя запись среди открытых строк больше не нужна. */
  function forget(): void {
    if (openedRow !== null && openedRow.owner === ownerRef.current) openedRow = null;
  }

  /** Вернуть строку на место. */
  function close(): void {
    openedRef.current = false;
    setOpened(false);
    forget();
    apply(0, true);
  }
  closeRef.current = close;

  /** Итог жеста: открыть строку (кнопки видны) или вернуть её на место. */
  function settle(open: boolean): void {
    const root = rootRef.current;
    if (open && openedRow !== null && openedRow.owner !== ownerRef.current) {
      openedRow.close();
    }
    openedRef.current = open;
    setOpened(open);
    if (open && root !== null) {
      openedRow = { el: root, owner: ownerRef.current, close: closeRef.current };
    } else {
      forget();
    }
    apply(open ? widthRef.current : 0, true);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    const root = rootRef.current;
    if (root === null || slideRef.current === null) return;
    if (e.button !== 0 || widthRef.current === 0) return;
    // Захват — у правого края строки: ленте топиков этот же край отдаёт
    // startsRowSwipe, так что жест не достанется обоим. Уже открытая строка
    // берёт жест по всей своей площади: её так и возвращают на место.
    if (!openedRef.current && e.clientX < root.getBoundingClientRect().right - ROW_SWIPE_ZONE)
      return;

    const base = offsetRef.current;
    const startX = e.clientX;
    const startY = e.clientY;
    let decided = false;
    let last = base;

    const detach = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      detachRef.current = null;
    };
    const done = (cancelled: boolean): void => {
      detach();
      // Палец не сдвинулся — это тап или долгий тач, не наш жест.
      if (!decided) return;
      if (cancelled) {
        // Жест отобрал браузер (вертикальный скролл списка): возвращаем
        // строку в то положение, в котором её взяли.
        apply(base, true);
        return;
      }
      // Дальше половины пути — доводим до кнопок, иначе возвращаем строку.
      settle(last >= widthRef.current / 2);
    };
    const move = (ev: PointerEvent): void => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < DRAG_START && Math.abs(dy) < DRAG_START) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          // Потянули по вертикали — это скролл списка, жест не наш.
          done(true);
          return;
        }
        decided = true;
        // Клик, которым закончится жест, не должен открывать заметку.
        suppressNextClick();
      }
      last = Math.max(0, Math.min(widthRef.current, base - dx));
      apply(last, false);
    };
    const onUp = (): void => done(false);
    const onCancel = (): void => done(true);

    detachRef.current = detach;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  // Пока строка открыта, тап мимо неё её закрывает. Слушатель — на фазе
  // перехвата: он срабатывает раньше, чем тап по другой строке откроет
  // заметку или меню, и ничего им не накладывает.
  useEffect(() => {
    if (!opened) return;
    const onDown = (e: PointerEvent): void => {
      const root = rootRef.current;
      if (root !== null && e.target instanceof Node && root.contains(e.target)) return;
      closeRef.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [opened]);

  // Строку могли размонтировать прямо во время жеста (список пересобрался):
  // слушатели на window снимаем, из общего списка открытых уходим.
  useEffect(
    () => () => {
      detachRef.current?.();
      forget();
    },
    [],
  );

  return { rootRef, slideRef, opened, onPointerDown, close };
}
