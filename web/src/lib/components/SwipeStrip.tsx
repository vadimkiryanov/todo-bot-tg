// Горизонтальная лента свайпов на базе siema (npm, ~13КБ) — замена SwiperJS
// ради лёгкости и простоты (см. CHANGELOG, этап 50). Слайд = элемент items.
//
// Почему не простой маппинг слайдов внутри контейнера siema: buildSliderFrame
// чистит контейнер через selector.innerHTML='' и заворачивает слайды во
// float-обёртки sliderFrame — якорь реконсиляции React уничтожается, и любая
// структурная мутация списка ломает DOM. Поэтому слайды живут в keyed-поддереве
// (key={planKey} на хосте), которое при изменении списка перемонтируется
// ЦЕЛИКОМ по плану (planKey/planIndex/planAnimateTo), а вертикальные скроллы
// живых слайдов (scrollSel) переносятся между пересборками (скролл уровня
// переживает вход/выход из папок).
//
// Конфиг, который siema читает только в конструкторе (draggable/duration),
// меняется пересозданием инстанса «на месте»: teardown эффекта
// destroy(restoreMarkup=true) возвращает слайды в контейнер без обёрток,
// новый конструктор строит frame заново с той же позицией — DOM слайдов
// (и их скроллы) не трогается, визуального сброса нет.
//
// События:
//  • onchange(index) — синхронно в момент смены currentSlide (релиз драга
//    или программный goTo) — как slideChange у Swiper (до конца доезда);
//  • onsettle(index) — после конца CSS-transition доезда: момент, когда
//    слайд физически встал (аналог slideChangeTransitionEnd). Нужен уровням
//    папок: смена уровня стора только после фактической остановки, чтобы
//    укорачивание цепочки не снесло уезжающий слайд посреди движения.
//
// Программные переходы — goTo(index, animate): у siema без loop переход это
// установка translate, а анимацию даёт CSS-transition на sliderFrame
// (enableTransition/disableTransition). Мгновенные переходы (prefers-
// reduced-motion) достигаются duration=0.
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type * as React from 'react';
import Siema from 'siema';

export interface SwipeStripHandle {
  /** Программный переезд: animate=true — с CSS-transition (длительность из
      duration), false — мгновенно. onchange/onsettle отработают как обычно. */
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
  /** Длительность доезда, мс (0 — всё мгновенно). */
  duration?: number;
  /** Порог драга до смены слайда, px. */
  threshold?: number;
  /** Селектор скролл-контейнера внутри слайда: его scrollTop переносится
      между пересборками. */
  scrollSel?: string;
  /** Смена слайда (см. шапку). */
  onchange?: (index: number) => void;
  /** Слайд встал после доезда (см. шапку). */
  onsettle?: (index: number) => void;
  /** Непрерывная позиция жеста, дробный индекс слайда (0 = первый):
      приходит каждый кадр, пока палец/мышь двигает ленту (драг-режим
      siema, translate3d sliderFrame). Вне жеста не вызывается. */
  ondragmove?: (position: number) => void;
  /** Жест завершён (отпускание/отмена) — новых ondragmove не будет.
      Вызывается и для клика без сдвига. finalPos — точка отпускания
      (последний move), если последний rAF-кадр ondragmove отстал от
      пальца (быстрый флик): считывать translate в этот момент уже нельзя
      (siema поставил его на целевой слайд), поэтому точку несёт сам
      ondragend — родитель ставит капсулу в неё и доезжает к активному
      слайду синхронно с доводкой siema. undefined — капсула уже на точке. */
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
  threshold = 0,
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

  // ── Состояние siema ────────────────────────────────────────────────────
  /** Хост keyed-поддерева: реф (не state) — перемонтирование по planKey
      меняет node, siema-эффект следит за planKey в deps. */
  const hostRef = useRef<HTMLDivElement | null>(null);
  const siemaRef = useRef<Siema | undefined>(undefined);
  /** Хост текущего инстанса (сравнением отличаем пересборку от смены конфига). */
  const lastHostRef = useRef<HTMLElement | undefined>(undefined);
  /** Текущий индекс — переживает пересоздание инстанса (конфиг-эффект). */
  const curIndexRef = useRef(0);

  // Свежие props для imperative API (handle создаётся один раз).
  const latestRef = useRef({ items, keyOf, onchange, onsettle, ondragmove, ondragend });
  latestRef.current = { items, keyOf, onchange, onsettle, ondragmove, ondragend };

  // Пересборка: список изменился — снять скроллы со СТАРОГО DOM и сменить
  // ключ keyed-поддерева ПРЯМО В РЕНДЕРЕ (render-phase update), а не после
  // commit. Иначе React успел бы согласовать новые items в старом хосте:
  // укорачивание цепочки (выход из папки свайпом-вправо) удалило бы fiber
  // хвостового слайда на живом хосте, а физически слайд лежит внутри
  // sliderFrame siema (buildSliderFrame забирает детей хоста) — removeChild
  // бросил бы DOMException и React размонтировал бы всё дерево (чёрный
  // экран). Смена ключа в том же рендере заставляет React заменить хост
  // целиком (старый удаляется одним узлом вместе с sliderFrame), без
  // промежуточной реконсиляции слайдов. Скроллы читаются из старого хоста,
  // который ещё в DOM (это поведение Svelte-$effect.pre). Рост цепочки
  // (вход в папку) планирует старт на слайде родителя и анимированный
  // доезд к глубокому; прочие изменения — сразу на initialIndex, без
  // анимации.
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

  // Жизненный цикл siema на текущем keyed-хосте. Зависимости: planKey (новая
  // пересборка — новый хост) и конфиг конструктора (draggable/duration/
  // threshold/scrollSel). При перезапуске cleanup сначала гасит старый
  // инстанс (restoreMarkup=true — слайды возвращаются в контейнер «как
  // были»), затем тело строит новый. Для нового хоста стартуем с planIndex
  // (и доезжаем до planAnimateTo при росте цепочки), для старого —
  // сохраняем текущую позицию (curIndex).
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const fresh = host !== lastHostRef.current;
    const index = fresh ? planIndexRef.current : curIndexRef.current;

    let settleTimer: number | undefined;
    let rafId = 0;

    const scheduleSettle = (idx: number): void => {
      if (settleTimer !== undefined) clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settleTimer = undefined;
        onsettle?.(idx);
      }, duration + 60);
    };

    const instance = new Siema({
      selector: host,
      startIndex: Math.max(0, index),
      draggable,
      duration,
      easing: 'ease-out',
      threshold,
      onChange: () => {
        curIndexRef.current = instance.currentSlide;
        onchange?.(instance.currentSlide);
        scheduleSettle(instance.currentSlide);
      },
    });
    siemaRef.current = instance;
    lastHostRef.current = host;

    // Мышиный драг (мост поверх хрупких mouse-хендлеров siema): siema не
    // проверяет кнопку в mousedown (правый клик начал бы драг) и ловит mouseup
    // только на хосте — отпускание над оверлеем поверх ленты (страница
    // заметки, контекстное меню) оставило бы pointerDown «залипшим», и слайд
    // ехал бы за курсором без нажатой кнопки. Чиним точечно (см. .svelte).
    const removeMouseBridge: (() => void)[] = [];
    if (draggable) {
      const filterNonPrimary = (e: MouseEvent): void => {
        if (e.button !== 0) e.stopPropagation();
      };
      host.addEventListener('mousedown', filterNonPrimary, true);

      // Клик после драга, начатого на кликабельном содержимом слайда
      // (карточка заметки/строка папки), надо гасить: siema подавляет click
      // после драга только для ссылок (preventClick ставится при target 'A'),
      // кнопки получают обычный click на отпускании — заметка/папка открылись
      // бы после свайпа. Следим за жестом сами и глушим click в capture на
      // хосте (раньше onclick содержимого), если курсор реально сдвинулся.
      // Порог — как MOVE_THRESHOLD карточек/папок (10px): дрожание мыши при
      // обычном клике драгом не считается.
      const CLICK_DRAG_PX = 10;
      let mouseDownX = 0;
      let mouseDragged = false;
      const trackMouseDown = (e: MouseEvent): void => {
        if (e.button !== 0) return;
        mouseDownX = e.clientX;
        mouseDragged = false;
      };
      const trackMouseMove = (e: MouseEvent): void => {
        if ((e.buttons & 1) === 0 || mouseDragged) return;
        if (Math.abs(e.clientX - mouseDownX) > CLICK_DRAG_PX) mouseDragged = true;
      };
      const swallowDragClick = (e: MouseEvent): void => {
        if (!mouseDragged) return;
        mouseDragged = false;
        // siema'шный preventClick тоже сбросить: этот click уже погашен,
        // следующему клику по ссылке нечего подавлять.
        instance.drag.preventClick = false;
        e.preventDefault();
        e.stopPropagation();
      };
      host.addEventListener('mousedown', trackMouseDown, true);
      host.addEventListener('mousemove', trackMouseMove, true);
      host.addEventListener('click', swallowDragClick, true);

      const finishMissedDrag = (): void => {
        if (instance.pointerDown !== true) return;
        instance.pointerDown = false;
        host.style.cursor = '-webkit-grab';
        instance.enableTransition();
        if (instance.drag.endX) instance.updateAfterDrag();
        instance.clearDrag();
      };
      window.addEventListener('mouseup', finishMissedDrag);

      // Непрерывная позиция жеста (капсула-подсветка островка топиков едет
      // за пальцем): событий драга у siema нет, поэтому промежуточное
      // смещение читается из translate3d sliderFrame в rAF-цикле, пока идёт
      // жест (двигать может и тач, и мышь). Значение — дробный индекс
      // слайда: -translateX / selectorWidth (perPage=1); вне драга siema
      // ставит transform на границы слайдов — те же координаты, поэтому
      // начало трека всегда совпадает с текущим слайдом.
      const DRAG_POS_EPS = 0.001;
      let dragTrackActive = false;
      let dragTrackRAF = 0;
      let lastDragPos = 0;
      /** Позиция, прочитанная в последнем move-событии: это точка, где
          палец/курсор находится СЕЙЧАС — от неё siema начнёт доезд при
          отпускании. (В момент отпускания translate прочитать уже нельзя:
          siema в своём touchend/mouseup сразу ставит style.transform на
          ЦЕЛЕВОЙ слайд, CSS-transition анимирует только рендер — rAF
          прочитал бы финал.) */
      let lastMovePos = 0;
      let lastTouchAt = 0;

      const readDragPos = (): number => {
        const frame = instance.sliderFrame;
        const m = /translate3d\((-?[\d.]+)px/.exec(frame.style.transform ?? '');
        const w = instance.selectorWidth;
        if (m === null || w === 0) return instance.currentSlide;
        return -Number(m[1]) / w;
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
        // флик), а в момент отпускания translate уже переписан siema на
        // целевой слайд (читать его нельзя — rAF выдал бы финал). Точку
        // отпускания несёт последний move: отдаём её через ondragend,
        // чтобы родитель поставил капсулу ровно в неё и доехал к активному
        // слайду синхронно с доводкой siema.
        if (Math.abs(lastMovePos - lastDragPos) > DRAG_POS_EPS) {
          ondragend?.(lastMovePos);
          return;
        }
        ondragend?.();
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
            ondragmove?.(p);
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
        // перезапускать трек: в этот момент translate — промежуточный доезд
        // siema, капсула «прилипла» бы к нему до эмулированного mouseup.
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
      // Завершение жеста ловим НА ХОСТЕ, а не на window: siema'шный
      // touchend/mouseup вызывает stopPropagation — до window событие не
      // доходит, а слушатели того же хоста, добавленные позже, вызываются.
      // Наши обработчики идут ПОСЛЕ siema'шных: он уже переключил слайд
      // (onChange) и поставил translate на цель — дальше работает родитель.
      host.addEventListener('touchend', onTrackTouchEnd);
      host.addEventListener('mouseup', onTrackMouseUp);
      // window — фолбэк для отпускания ВНЕ хоста (stopPropagation не было):
      // обработчик siema не сработал, жест завершаем здесь.
      window.addEventListener('touchend', onTrackTouchEnd, { passive: true });
      window.addEventListener('touchcancel', onTrackTouchEnd, { passive: true });
      host.addEventListener('mousedown', onTrackMouseDown);
      window.addEventListener('mouseup', onTrackMouseUp);
      host.addEventListener('touchmove', onTrackMove, { passive: true });
      host.addEventListener('mousemove', onTrackMove);
      host.addEventListener('mouseleave', onTrackMouseLeave);

      removeMouseBridge.push(
        () => host.removeEventListener('mousedown', filterNonPrimary, true),
        () => host.removeEventListener('mousedown', trackMouseDown, true),
        () => host.removeEventListener('mousemove', trackMouseMove, true),
        () => host.removeEventListener('click', swallowDragClick, true),
        () => window.removeEventListener('mouseup', finishMissedDrag),
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
    // позицию, дальше работает CSS-transition.
    const target = planAnimateToRef.current;
    if (fresh && target > index) {
      rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          instance.goTo(target);
        });
      });
    }

    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      if (settleTimer !== undefined) clearTimeout(settleTimer);
      for (const off of removeMouseBridge) off();
      instance.destroy(true);
      if (siemaRef.current === instance) siemaRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- порт $effect (см. SwipeStrip.svelte)
  }, [planKey, draggable, duration, threshold, scrollSel]);

  // ── Imperative API (ref родителя) ──────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      goTo(index: number, animate: boolean): void {
        const s = siemaRef.current;
        if (s === undefined) return;
        const len = latestRef.current.items.length;
        const target = Math.max(0, Math.min(index, len - 1));
        if (target === s.currentSlide) return;
        if (animate) s.enableTransition();
        else s.disableTransition();
        s.goTo(target);
      },
      getIndex(): number {
        return siemaRef.current?.currentSlide ?? -1;
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
  );
}
