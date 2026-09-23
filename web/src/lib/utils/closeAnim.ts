// Обратная анимация закрытия для дропдаун-меню и подсказок: слой доигрывает
// уход (*-out) и только потом уходит из разметки — без этого меню закрывалось
// бы рывком, хотя открывалось плавно.
// Парная длительность живёт в app.css (.menu-out — pop-out 0.16s,
// .toast-out — 0.18s): меняешь одну — поправь и вторую.
import { useCallback, useEffect, useRef, useState } from 'react';

/** Длительность обратной анимации — как у .menu-out в app.css. */
export const CLOSE_ANIM_MS = 160;

export interface CloseAnim {
  /**
   * Уход идёт: разметка рисует *-out-класс вместо *-anim. По концу ухода
   * сбрасывается — слой, который остался в разметке, не должен держать *-out
   * (иначе его следующее открытие тут же гаснет).
   */
  closing: boolean;
  /** Запросить закрытие — анимированное (по умолчанию) или мгновенное. */
  requestClose: () => void;
}

/** Движение в системе отключено — анимацию не играем, закрываем сразу. */
function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Закрытие с обратной анимацией. requestClose идемпотентен: повторные вызовы
 * во время ухода игнорируются, onClose зовётся ровно один раз. durationMs = 0
 * (и режим «меньше движения») закрывает мгновенно.
 */
export function useCloseAnim(
  onClose: () => void,
  durationMs: number = CLOSE_ANIM_MS,
): CloseAnim {
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // Свежий onClose без пересоздания requestClose (её держат в [] эффекты Escape).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Слой размонтировали раньше конца анимации — таймер не должен сработать.
  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    },
    [],
  );

  const requestClose = useCallback(() => {
    if (timer.current !== undefined) return; // уход уже идёт
    if (durationMs <= 0 || reducedMotion()) {
      onCloseRef.current();
      return;
    }
    setClosing(true);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setClosing(false); // уход доигран: слой снова «не закрывается»
      onCloseRef.current();
    }, durationMs);
  }, [durationMs]);

  return { closing, requestClose };
}
