// Доводка после отпускания пальца — критически демпфированная пружина.
// Заводская CSS-transition Swiper стартует с нулевой/произвольной скорости:
// слайд ехал за пальцем и в момент отпускания «тормозит-разгоняется» (рывок).
// Пружина на requestAnimationFrame пишет translate напрямую (sw.setTranslate)
// без реактивного рендера на каждый кадр; когда пружина пришла к цели —
// мгновенный slideTo(index, 0): Swiper синхронно обновляет активный слайд и
// эмитит slideChange уже ПОСЛЕ остановки — контент/стор переключаются на
// неподвижном экране. Механика общая для всех свайперов приложения: смена
// топиков и «назад» по уровням папок используют один и тот же ход.
import type { Swiper } from 'swiper/types';

/** Сигнатура sw.slideTo (метод инстанса). */
type SlideToFn = (
  index?: number,
  speed?: number,
  runCallbacks?: boolean,
  internal?: boolean,
  initial?: boolean,
) => boolean;

export interface SlideSpringHooks {
  /** Отпускание с движением: доводка выбрала слайд index (ещё едет).
      Подсветка «намерения» и предзагрузка цели — здесь, в момент отпускания. */
  onIntent?: (index: number) => void;
  /** Отпускание после реального drag — подавление «клика отпускания». */
  onGesture?: () => void;
  /** Новое касание (сброс подсветки-«намерения»). */
  onTouchStart?: () => void;
}

const K = 400; // ω²
const C = 40; // 2ω — критическое демпфирование

/**
 * Установить пружинную доводку на свайпер. Возвращает функцию отключения:
 * восстанавливает sw.slideTo и снимает обработчики.
 */
export function installSlideSpring(sw: Swiper, hooks: SlideSpringHooks = {}): () => void {
  const origSlideTo = sw.slideTo.bind(sw) as SlideToFn;
  let springRaf: number | undefined;
  let springIndex: number | null = null;
  /** Отпускание пальца: скорость для подхвата + момент (свежесть проверяет
      slideToWithSpring — программный slideTo не подхватит старый жест). */
  let springPending: { vx: number; at: number } | null = null;
  /** Пружина отменена новым касанием (слайд пойман на полпути). */
  let springHalted = false;
  let dragMoved = false;

  let lastMoveT = 0;
  let lastMoveX = 0;
  let swipeVx = 0;

  const cancelSpring = (): void => {
    if (springRaf !== undefined) cancelAnimationFrame(springRaf);
    springRaf = undefined;
  };

  /** Довести пружиной до слайда index. v0 — px/с (скорость пальца). */
  const runSpring = (index: number, v0: number): void => {
    cancelSpring();
    const target = -sw.snapGrid[Math.min(index, sw.snapGrid.length - 1)];
    // «Намерение» видно сразу (таб/превью подсвечивают цель), контент
    // переключится в конце доводки, когда slideChange вызовет стор.
    hooks.onIntent?.(index);
    const finish = (): void => {
      springIndex = null;
      springRaf = undefined;
      // Мгновенный slideTo: translate уже у цели — Swiper обновит индекс,
      // классы и эмитит slideChange (runCallbacks=true, как в slideTo).
      origSlideTo(index, 0, true);
    };
    let x = sw.translate;
    let v = v0;
    sw.setTransition(0); // снять возможный CSS-transition от прошлого перехода
    if (Math.abs(target - x) < 0.5 && Math.abs(v) < 1) {
      sw.setTranslate(target);
      finish();
      return;
    }
    let prev = performance.now();
    const step = (now: number): void => {
      if (springRaf === undefined) return; // пружина отменена (новый жест)
      const dt = Math.min((now - prev) / 1000, 0.032);
      prev = now;
      const dx = target - x;
      if (Math.abs(dx) < 0.5 && Math.abs(v) < 1) {
        sw.setTranslate(target);
        finish();
        return;
      }
      v += (K * dx - C * v) * dt;
      x += v * dt;
      // Округление только на записи в DOM (субпиксельный transform
      // «дрожит»), x остаётся непрерывным — иначе пружина застревает
      // в пикселе от цели и не достигает условия остановки.
      sw.setTranslate(Math.round(x));
      springRaf = requestAnimationFrame(step);
    };
    springIndex = index;
    springRaf = requestAnimationFrame(step);
  };

  /** Обёртка slideTo: жестовый вызов (из touchEnd свайпера) — пружина;
      программный (тап по табу, эффекты) — оригинальный slideTo. */
  const slideToWithSpring: SlideToFn = (
    index?: number,
    speed?: number,
    runCallbacks = true,
    internal?: boolean,
    initial?: boolean,
  ) => {
    const pending = springPending;
    springPending = null;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (
      reduced ||
      speed === 0 ||
      pending === null ||
      performance.now() - pending.at > 250
    ) {
      return origSlideTo(
        index,
        reduced && speed !== 0 ? 0 : speed,
        runCallbacks,
        internal,
        initial,
      );
    }
    if (index === undefined) return origSlideTo(undefined, speed, runCallbacks, internal, initial);
    runSpring(index, pending.vx * 1000);
    return true;
  };
  sw.slideTo = slideToWithSpring as typeof sw.slideTo;

  /** Скорость горизонтального драга (px/ms, сглаженная по последним
      движениям) — доводка-пружина стартует со скорости пальца. */
  const onSliderMove = (): void => {
    dragMoved = true;
    const now = performance.now();
    const x = sw.touches.currentX;
    const dt = now - lastMoveT;
    if (lastMoveT > 0 && dt > 0) {
      const inst = (x - lastMoveX) / dt;
      swipeVx = dt > 48 ? inst : swipeVx * 0.6 + inst * 0.4;
    }
    lastMoveX = x;
    lastMoveT = now;
  };

  const onTouchStart = (): void => {
    // Новое касание: подсветка-«цель» сбрасывается (пружина/жест заново
    // выставят её в runSpring); если пружина идёт — гасим её, свайпер
    // поведёт от текущей позиции, а если касание окажется тапом (движения
    // не было) — доводку возобновим в touchEnd.
    hooks.onTouchStart?.();
    if (springRaf !== undefined) {
      springHalted = true;
      cancelSpring();
    }
    lastMoveT = 0;
    springPending = null;
  };

  const onTouchEnd = (): void => {
    if (dragMoved) {
      dragMoved = false;
      hooks.onGesture?.();
    }
    // Скорость отпускания для доводки (свежесть — в slideToWithSpring).
    springPending = { vx: swipeVx, at: performance.now() };
    if (springHalted && springIndex !== null && !sw.touchEventsData.isMoved) {
      // Тап (без движения) во время доводки — доезжаем к прежней цели.
      springHalted = false;
      runSpring(springIndex, 0);
    } else {
      springHalted = false;
    }
  };

  sw.on('sliderMove', onSliderMove);
  sw.on('touchStart', onTouchStart);
  sw.on('touchEnd', onTouchEnd);

  return () => {
    cancelSpring();
    sw.slideTo = origSlideTo;
    sw.off('sliderMove', onSliderMove);
    sw.off('touchStart', onTouchStart);
    sw.off('touchEnd', onTouchEnd);
  };
}
