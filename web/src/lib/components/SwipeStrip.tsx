// Горизонтальная лента свайпов на базе embla-carousel — тот же движок, что
// у shadcn Carousel (этап 56, см. CHANGELOG); замена siema (этап 50).
// Слайд = элемент items.
//
// Почему Embla напрямую, а не хук useEmblaCarousel / обёртка shadcn
// Carousel: лента живёт по ключу keyed-поддерева (key={planKey}) и
// пересоздаёт движок «на месте» при смене конфига — api нужен синхронно
// до paint (useLayoutEffect), а хук отдаёт api только после повторного
// рендера. Каноническая обвязка Carousel (контекст/стрелки/отступы) для
// кастомного keyed-стрипа неприменима; движок при этом тот же
// (embla-carousel), чего достаточно для ухода от siema.
//
// Структура DOM (цепочка высот — структурные правила в app.css):
//   host (key={planKey}) > viewport (root движка, overflow-hidden)
//     > container (первый ребёнок root: flex h-full) > слайды .swipe-strip-slide
// Embla позиционирует container transform'ом; слайды 100% ширины
// (flex: 0 0 100% — в app.css), поэтому до инициализации виден первый.
//
// Пересборка списка — keyed-remount хоста по плану (planKey/planIndex/
// planAnimateTo), вертикальные скроллы живых слайдов (scrollSel)
// переносятся между пересборками (скролл уровня переживает вход/выход из
// папок). Конфиг (draggable/duration), который Embla читает только в
// конструкторе, меняется пересозданием инстанса «на месте»: destroy + новый
// EmblaCarousel — Embla не трогает DOM слайдов, стартуем с текущей позиции
// (curIndex), визуального сброса нет.
//
// События:
//  • onchange(index) — синхронно в момент select: у Embla select эмитится
//    при релизе драга (up()) или программном scrollTo, до конца доезда —
//    как slideChange у Swiper / onChange у siema;
//  • onsettle(index) — по событию settle (движок физически остановился),
//    так что смена уровня стора (уровни папок) происходит только после
//    фактической остановки и укорачивание цепочки не сносит уезжающий
//    слайд посреди движения. Страховочный таймер (1200 мс) покрывает
//    мгновенные переходы (jump / duration=0), где анимации нет и settle
//    не эмитится.
//
// Программные переходы — goTo(index, animate): api.scrollTo(index, !animate)
// (jump=true — мгновенно; иначе анимация движка с СКОНВЕРТИРОВАННЫМ
// options.duration — см. JSDoc пропа duration: у Embla это коэффициент
// мягкости, а не время в мс).
//
// Драг — встроенный DragHandler Embla: фильтрует правую кнопку мыши,
// гасит click после драга > dragThreshold (10px по умолчанию — как
// MOVE_THRESHOLD карточек/папок) и ловит mouseup на ownerDocument, так что
// «мышиный мост» siema-версии (filterNonPrimary/swallowDragClick/
// finishMissedDrag) не нужен. Непрерывная позиция жеста (капсула островка
// едет за пальцем) читается из api.scrollProgress() в rAF-цикле: слайды
// 100% ширины, прогресс 0..1 между первым и последним, позиция =
// progress * (count - 1).
import { useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type * as React from 'react';
import EmblaCarousel from 'embla-carousel';
import type { EmblaCarouselType } from 'embla-carousel';

export interface SwipeStripHandle {
  /** Программный переезд: animate=true — с анимацией движка (длительность
      из duration), false — мгновенно. onchange/onsettle отработают как
      обычно. */
  goTo(index: number, animate: boolean): void;
  /** Текущий индекс слайда (-1 — лента ещё не инициализирована). */
  getIndex(): number;
  /** Количество слайдов. */
  getCount(): number;
}

interface SwipeStripProps<T> {
  /** Слайды в порядке следования. */
  items: T[];
  /** Стабильный ключ слайда (id топика/уровня) — пересборка по нему. */
  keyOf: (item: T, index: number) => string;
  /** Контент слайда. */
  children: (item: T, index: number) => ReactNode;
  /** Слайд, на котором оказаться после пересборки (когда список НЕ вырос). */
  initialIndex?: number;
  /** Рост списка (добавлен хвост) — анимированный доезд к последнему слайду
      (вход в папку: цепочка уровней растёт вглубь). */
  animateGrowth?: boolean;
  /** Листается ли лента жестом. Внешние топики выключены внутри папки,
      уровни — наоборот («ровно один включён»). */
  draggable?: boolean;
  /** Длительность видимого доезда, мс (0 — программные переходы мгновенные).
      В options.duration движка уходит СКОНВЕРТИРОВАННОЕ значение: у Embla
      это не «время в мс», а коэффициент мягкости физики ScrollBody
      (friction 0.68) — фактическое время программного scrollTo ≈ 71×
      (до события settle) / ≈39× (до визуальной остановки). Делим на 40,
      чтобы видимый доезд занимал ~duration мс (как CSS-переход siema). */
  duration?: number;
  /** Не используется: унаследован от siema-сигнатуры (порог смены слайда).
      У Embla снап решает позиция/скорость релиза (переход от ~20% ширины),
      аналога порога нет — значение игнорируется. */
  threshold?: number;
  /** Селектор скролл-контейнера внутри слайда: его scrollTop переносится
      между пересборками. */
  scrollSel?: string;
  /** Смена слайда (см. шапку). */
  onchange?: (index: number) => void;
  /** Слайд встал после доезда (см. шапку). */
  onsettle?: (index: number) => void;
  /** Непрерывная позиция жеста, дробный индекс слайда (0 = первый):
      приходит каждый кадр, пока палец/мышь двигает ленту. Вне жеста не
      вызывается. */
  ondragmove?: (position: number) => void;
  /** Жест завершён (отпускание/отмена) — новых ondragmove не будет.
      Вызывается и для клика без сдвига. finalPos — точка отпускания
      (последний move), если последний rAF-кадр ondragmove отстал от
      пальца (быстрый флик): позицию движка в этот момент читать уже нельзя
      (Embla начал доводку к целевому слайду), поэтому точку несёт сам
      ondragend — родитель ставит капсулу в неё и доезжает к активному
      слайду синхронно с доводкой. undefined — капсула уже на точке. */
  ondragend?: (finalPos?: number) => void;
}

/** Слайды keyed-поддерева хоста (считывание скроллов и их перенос). */
function slideNodes(host: HTMLElement): { key: string; el: HTMLElement }[] {
  const out: { key: string; el: HTMLElement }[] = [];
  for (const el of host.querySelectorAll<HTMLElement>('.swipe-strip-slide')) {
    const key = el.dataset.stripKey;
    if (key !== undefined) out.push({ key, el });
  }
  return out;
}

export function SwipeStrip<T>({
  items,
  keyOf,
  children,
  initialIndex = 0,
  animateGrowth = false,
  draggable = true,
  duration = 360,
  scrollSel = '.chat-scroll',
  onchange,
  onsettle,
  ondragmove,
  ondragend,
  ref,
}: SwipeStripProps<T> & { ref?: React.Ref<SwipeStripHandle> }) {
  // ── План пересборки ────────────────────────────────────────────────────
  // Сигнатура списка (состав+порядок) — ключ перемонтирования keyed-поддерева.
  const sigOf = (): string => items.map((it, i) => keyOf(it, i)).join('\u0000');

  /** Ключ текущей пересборки (начальное значение — первое монтирование). */
  const [planKey, setPlanKey] = useState<string>(() => sigOf());
  /** Стартовый слайд после пересборки. */
  const planIndexRef = useRef(initialIndex);
  /** >= 0 — после старта анимированно доехать до этого слайда (рост цепочки). */
  const planAnimateToRef = useRef(-1);
  /** Скроллы живых слайдов старого DOM (ключ слайда → scrollTop). */
  const planRestoreRef = useRef<Map<string, number>>(new Map());

  // ── Состояние Embla ────────────────────────────────────────────────────
  /** Хост keyed-поддерева: реф (не state) — перемонтирование по planKey
      меняет node, эффект движка следит за planKey в deps. */
  const hostRef = useRef<HTMLDivElement | null>(null);
  /** Viewport — root движка (первый ребёнок root = container). */
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<EmblaCarouselType | null>(null);
  /** Хост текущего инстанса (сравнением отличаем пересборку от смены конфига). */
  const lastHostRef = useRef<HTMLElement | undefined>(undefined);
  /** Текущий индекс — переживает пересоздание инстанса (конфиг-эффект). */
  const curIndexRef = useRef(0);

  // Свежие props для imperative API и колбэков движка (создаются один раз).
  const latestRef = useRef({ items, keyOf, onchange, onsettle, ondragmove, ondragend });
  latestRef.current = { items, keyOf, onchange, onsettle, ondragmove, ondragend };

  // Пересборка: список изменился — снять скроллы со СТАРОГО DOM и сменить
  // ключ keyed-поддерева ПРЯМО В РЕНДЕРЕ (render-phase update), а не после
  // commit. Иначе React успел бы согласовать новые items в старом хосте:
  // укорачивание цепочки (выход из папки свайпом-вправо) удалило бы fiber
  // хвостового слайда на живом хосте, а контейнер позиционируется Embla
  // transform'ом — removeChild на лету сдвинул бы оставшиеся слайды
  // (transform контейнера не пересчитан) и лента «прыгнула» бы. Смена ключа
  // в том же рендере заставляет React заменить хост целиком (старый
  // удаляется одним узлом), без промежуточной реконсиляции слайдов.
  // Скроллы читаются из старого хоста, который ещё в DOM (это поведение
  // Svelte-$effect.pre). Рост цепочки (вход в папку) планирует старт на
  // слайде родителя и анимированный доезд к глубокому; прочие изменения —
  // сразу на initialIndex, без анимации.
  const sig = sigOf();
  if (sig !== planKey) {
    const host = hostRef.current;
    if (host !== null && host.isConnected) {
      const captured = new Map<string, number>();
      for (const { key, el } of slideNodes(host)) {
        const sc = el.querySelector<HTMLElement>(scrollSel);
        if (sc !== null) captured.set(key, sc.scrollTop);
      }
      planRestoreRef.current = captured;
    }

    const len = items.length;
    // Прошлая длина списка — из сигнатуры старого плана (разделитель \u0000).
    const prevLen = planKey === '' ? 0 : planKey.split('\u0000').length;
    const growing = prevLen > 0 && len > prevLen && animateGrowth;
    planIndexRef.current = growing ? len - 2 : Math.min(initialIndex, Math.max(0, len - 1));
    planAnimateToRef.current = growing ? len - 1 : -1;
    setPlanKey(sig);
  }

  // Жизненный цикл Embla на текущем keyed-хосте. Зависимости: planKey (новая
  // пересборка — новый хост) и конфиг конструктора (draggable/duration/
  // scrollSel). При перезапуске cleanup гасит старый инстанс, тело строит
  // новый на том же DOM (слайды Embla не трогает). Для нового хоста
  // стартуем с planIndex (и доезжаем до planAnimateTo при росте цепочки),
  // для старого — сохраняем текущую позицию (curIndex).
  useLayoutEffect(() => {
    const host = hostRef.current;
    const viewport = viewportRef.current;
    if (host === null || viewport === null) return;

    const fresh = host !== lastHostRef.current;
    const index = fresh ? planIndexRef.current : curIndexRef.current;
    let growthRaf = 0;

    // onsettle: settle движка (фактическая остановка) + страховочный таймер
    // на мгновенные переходы (jump / duration=0), где анимации нет и settle
    // не эмитится. pendingSettle сбрасывается первым пришедшим сигналом,
    // так что settle «возврата без смены слайда» (select не было) ничего
    // не вызывает — как scheduleSettle siema-версии после onChange.
    let pendingSettle = -1;
    let settleTimer: number | undefined;
    const flushSettle = (): void => {
      if (settleTimer !== undefined) {
        clearTimeout(settleTimer);
        settleTimer = undefined;
      }
      if (pendingSettle < 0) return;
      const idx = pendingSettle;
      pendingSettle = -1;
      latestRef.current.onsettle?.(idx);
    };
    const scheduleSettle = (idx: number): void => {
      pendingSettle = idx;
      if (settleTimer !== undefined) clearTimeout(settleTimer);
      settleTimer = window.setTimeout(flushSettle, 1200);
    };

    const api = EmblaCarousel(viewport, {
      axis: 'x',
      startIndex: Math.max(0, index),
      watchDrag: draggable,
      // См. JSDoc пропа duration: физика Embla растягивает программный
      // scrollTo в ~71× от options.duration (settle) — конвертируем
      // «видимые мс» в коэффициент мягкости движка.
      duration: duration === 0 ? 0 : Math.max(1, Math.round(duration / 40)),
    });
    apiRef.current = api;
    lastHostRef.current = host;

    const handleSelect = (): void => {
      const idx = api.selectedScrollSnap();
      curIndexRef.current = idx;
      latestRef.current.onchange?.(idx);
      scheduleSettle(idx);
    };
    api.on('select', handleSelect);
    api.on('settle', flushSettle);

    // Непрерывная позиция жеста (капсула-подсветка островка едет за
    // пальцем): промежуточного смещения как события у Embla нет, позиция
    // читается из scrollProgress в rAF-цикле, пока идёт жест (двигать может
    // и тач, и мышь). Слайды 100% ширины: прогресс 0..1 между первым и
    // последним слайдом; в покое значение — целый индекс, во время драга —
    // непрерывно (отставание ≤ 1 rAF-кадр: translate контейнера движок
    // обновляет в своём rAF).
    const removeTrack: (() => void)[] = [];
    if (draggable) {
      const DRAG_POS_EPS = 0.001;
      let dragTrackActive = false;
      let dragTrackRAF = 0;
      let lastDragPos = 0;
      /** Позиция, прочитанная в последнем move-событии: это точка, где
          палец/курсор находится СЕЙЧАС — от неё движок начнёт доводку при
          отпускании. (В момент отпускания позицию движка прочитать уже
          нельзя: Embla начал анимацию к целевому слайду — rAF выдал бы
          финал.) */
      let lastMovePos = 0;
      let lastTouchAt = 0;

      const readDragPos = (): number => {
        const n = api.slideNodes().length;
        if (n < 2) return 0;
        return api.scrollProgress() * (n - 1);
      };

      const noteMove = (): void => {
        lastMovePos = readDragPos();
      };

      const stopDragTrack = (emit: boolean): void => {
        if (!dragTrackActive) return;
        dragTrackActive = false;
        cancelAnimationFrame(dragTrackRAF);
        if (!emit) return;
        // Финальный rAF-кадр ondragmove мог отстать от пальца (быстрый
        // флик), а движок уже начал доводку (позицию читать нельзя — rAF
        // выдал бы финал). Точку отпускания несёт последний move: отдаём её
        // через ondragend, чтобы родитель поставил капсулу ровно в неё и
        // доехал к активному слайду синхронно с доводкой движка.
        if (Math.abs(lastMovePos - lastDragPos) > DRAG_POS_EPS) {
          latestRef.current.ondragend?.(lastMovePos);
          return;
        }
        latestRef.current.ondragend?.();
      };

      const startDragTrack = (): void => {
        if (dragTrackActive) return;
        dragTrackActive = true;
        lastDragPos = readDragPos();
        lastMovePos = lastDragPos;
        const frame = (): void => {
          if (!dragTrackActive) return;
          const p = readDragPos();
          if (Math.abs(p - lastDragPos) > DRAG_POS_EPS) {
            lastDragPos = p;
            latestRef.current.ondragmove?.(p);
          }
          dragTrackRAF = requestAnimationFrame(frame);
        };
        dragTrackRAF = requestAnimationFrame(frame);
      };

      const onTrackTouchStart = (): void => {
        lastTouchAt = Date.now();
        startDragTrack();
      };
      const onTrackMouseDown = (e: MouseEvent): void => {
        // Эмулированный после тача mousedown (быстрый тап) не должен
        // перезапускать трек: в этот момент лента в доезде, капсула
        // «прилипла» бы к нему до эмулированного mouseup.
        if (e.button !== 0 || Date.now() - lastTouchAt < 500) return;
        startDragTrack();
      };
      const onTrackMove = (): void => {
        if (dragTrackActive) noteMove();
      };
      const onTrackTouchEnd = (): void => stopDragTrack(true);
      const onTrackMouseUp = (): void => stopDragTrack(true);
      const onTrackMouseLeave = (): void => stopDragTrack(true);
      host.addEventListener('touchstart', onTrackTouchStart);
      // Завершение жеста ловим НА ХОСТЕ, а не на window: слушатели того же
      // хоста, добавленные позже Embla'шных (root = viewport — вложенный
      // элемент, его обработчики отрабатывают раньше при всплытии).
      host.addEventListener('touchend', onTrackTouchEnd);
      host.addEventListener('mouseup', onTrackMouseUp);
      // window — фолбэк для отпускания ВНЕ хоста.
      window.addEventListener('touchend', onTrackTouchEnd, { passive: true });
      window.addEventListener('touchcancel', onTrackTouchEnd, { passive: true });
      host.addEventListener('mousedown', onTrackMouseDown);
      window.addEventListener('mouseup', onTrackMouseUp);
      host.addEventListener('touchmove', onTrackMove, { passive: true });
      host.addEventListener('mousemove', onTrackMove);
      host.addEventListener('mouseleave', onTrackMouseLeave);

      removeTrack.push(
        () => host.removeEventListener('touchstart', onTrackTouchStart),
        () => host.removeEventListener('touchend', onTrackTouchEnd),
        () => host.removeEventListener('mouseup', onTrackMouseUp),
        () => window.removeEventListener('touchend', onTrackTouchEnd),
        () => window.removeEventListener('touchcancel', onTrackTouchEnd),
        () => host.removeEventListener('mousedown', onTrackMouseDown),
        () => window.removeEventListener('mouseup', onTrackMouseUp),
        () => host.removeEventListener('touchmove', onTrackMove),
        () => host.removeEventListener('mousemove', onTrackMove),
        () => host.removeEventListener('mouseleave', onTrackMouseLeave),
        // Тихий стоп трекера при пересборке/размонтировании: ondragend
        // родителю не нужен — он сам пересобирается вместе с лентой.
        () => stopDragTrack(false),
      );
    }

    // Перенести скроллы пережившим пересборку слайдам (контент уже в DOM:
    // у превью из кеша он синхронный; у живых списков скролл и раньше
    // сбрасывался загрузкой — поведение не менялось).
    const restore = planRestoreRef.current;
    planRestoreRef.current = new Map();
    if (restore.size > 0) {
      for (const { key, el } of slideNodes(host)) {
        const sc = el.querySelector<HTMLElement>(scrollSel);
        const top = restore.get(key);
        if (sc !== null && top !== undefined) sc.scrollTop = top;
      }
    }

    // Рост цепочки: старт на слайде родителя, затем анимированный доезд к
    // глубокому. Двойной rAF: первый кадр успевает показать стартовую
    // позицию, дальше работает анимация движка.
    const target = planAnimateToRef.current;
    if (fresh && target > index) {
      growthRaf = requestAnimationFrame(() => {
        growthRaf = requestAnimationFrame(() => {
          growthRaf = 0;
          api.scrollTo(target);
        });
      });
    }

    return () => {
      if (growthRaf !== 0) cancelAnimationFrame(growthRaf);
      if (settleTimer !== undefined) clearTimeout(settleTimer);
      api.off('select', handleSelect);
      api.off('settle', flushSettle);
      for (const off of removeTrack) off();
      api.destroy();
      if (apiRef.current === api) apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- рефы и колбэки через latestRef
  }, [planKey, draggable, duration, scrollSel]);

  // ── Imperative API (ref родителя) ──────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      goTo(index: number, animate: boolean): void {
        const api = apiRef.current;
        if (api === null) return;
        const len = latestRef.current.items.length;
        if (len === 0) return;
        const target = Math.max(0, Math.min(index, len - 1));
        if (target === api.selectedScrollSnap()) return;
        api.scrollTo(target, !animate);
      },
      getIndex(): number {
        return apiRef.current?.selectedScrollSnap() ?? -1;
      },
      getCount(): number {
        return latestRef.current.items.length;
      },
    }),
    [],
  );

  return (
    <div
      key={planKey}
      ref={hostRef}
      className="swipe-strip-host block h-full w-full"
      role="group"
      aria-roledescription="карусель"
    >
      <div ref={viewportRef} className="h-full overflow-hidden">
        <div className="swipe-strip-container flex h-full">
          {items.map((item, index) => (
            <div
              key={keyOf(item, index)}
              className="swipe-strip-slide block h-full"
              data-strip-key={keyOf(item, index)}
            >
              {children(item, index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
