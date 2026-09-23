// Появление и уход строки списка: высота строки едет от нуля к своей (и
// обратно), поэтому соседи пододвигаются плавно, а не прыгают. Строка — сам
// Cell: обёртку в Section ставить нельзя (скругления углов карточки и
// разделители библиотека вешает на прямых детей списка — обёртка их забирает).
//
// Настоящую высоту читаем, на кадр сняв ограничение (height: auto). В
// схлопнутом виде scrollHeight не годится: строка — flex с align-items:center,
// и верхняя половина контента в переполнение не попадает (отдаёт ровно
// половину высоты). Замер идёт в useLayoutEffect — до отрисовки, на экране его
// не видно.
//
// Длительность держим в одном месте (ROW_SWING_MS) — переход ставится
// инлайном в style строки, а таймер «доиграла» отсчитывается от той же
// константы плюс запас на кадр.
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';

/** Сколько едет раскрытие/схлопывание строки. */
export const ROW_SWING_MS = 220;

/** idle — строка живёт как обычно; enter — раскрывается; leave — схлопывается. */
export type RowPhase = 'idle' | 'enter' | 'leave';

export interface RowSwing {
  /** Ссылка на корень строки (Cell отдаёт её своему корневому элементу). */
  ref: RefObject<HTMLButtonElement | null>;
  /** Инлайн-стиль анимации высоты; undefined — строка не анимируется. */
  style: CSSProperties | undefined;
}

/**
 * Анимация высоты строки. phase меняется — строка раскрывается (enter) или
 * схлопывается (leave); onSettled зовётся, когда анимация доиграна (строка
 * ушла из разметки или вернулась в обычное состояние).
 */
export function useRowSwing(phase: RowPhase, onSettled?: () => void): RowSwing {
  const ref = useRef<HTMLButtonElement>(null);
  /** Явная высота на время анимации (px); undefined — строка не анимируется. */
  const [height, setHeight] = useState<number | undefined>(undefined);
  // Свежий колбэк без перезапуска анимации: он приходит новой стрелкой.
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  useLayoutEffect(() => {
    const el = ref.current;
    if (phase === 'idle' || el === null) {
      setHeight(undefined);
      return;
    }
    // Движение в системе отключено — строка появляется/уходит сразу.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setHeight(undefined);
      settledRef.current?.();
      return;
    }

    const keep = el.style.height;
    el.style.height = 'auto';
    const natural = el.offsetHeight;
    el.style.height = keep;
    if (natural === 0) {
      setHeight(undefined);
      settledRef.current?.();
      return;
    }

    // Кадр со стартовой высотой, следующий — с конечной: без этой паузы
    // браузер перехода не увидит.
    setHeight(phase === 'enter' ? 0 : natural);
    const frame = requestAnimationFrame(() => {
      setHeight(phase === 'enter' ? natural : 0);
    });
    const timer = window.setTimeout(() => {
      // Раскрытую строку возвращаем к height: auto — иначе она осталась бы с
      // жёсткой высотой и не выросла бы при переформатировании текста.
      if (phase === 'enter') setHeight(undefined);
      settledRef.current?.();
    }, ROW_SWING_MS + 40);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [phase]);

  const animated = height !== undefined;
  const style: CSSProperties | undefined = animated
    ? {
        height: `${height}px`,
        overflow: 'hidden',
        // Прозрачность едет вместе с высотой: строка не «вылезает» из ниоткуда.
        opacity: height === 0 ? 0 : undefined,
        transition: `height ${ROW_SWING_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${ROW_SWING_MS}ms`,
      }
    : undefined;

  return { ref, style };
}
