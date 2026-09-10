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
//       > .swipe-strip-slide-inner (слой fade-режима) > контент слайда
// Embla позиционирует container transform'ом; слайды 100% ширины
// (flex: 0 0 100% — в app.css), поэтому до инициализации виден первый.
// Внутренний слой добавлен ради режима кросс-фейда (проп fade): слайды не
// едут, а проявляются друг через друга, и transform'ы «стягивания»/
// прозрачность живут на этом слое — сам слайд остаётся нетронутым, иначе
// сбились бы замеры Embla (getBoundingClientRect слайдов = snaps и размеры).
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
// Программные переходы — goTo(index, animate). Мгновенный (animate=false) —
// api.scrollTo(index, true) (jump). Анимированный — НАПРЯМУЮ через движок
// (engine.scrollBody.useFriction(DRIVE_FRICTION).useDuration(DRIVE_DURATION);
// engine.scrollTo.index(target, 0)), а не api.scrollTo(index, false):
// api.scrollTo всегда ставит длительность из options.duration, а при ней
// (÷40 от мс, см. JSDoc пропа duration) физика ScrollBody недодемпфирована
// и дальней доезд перелетает цель — подробности в goTo.
//
// Драг — встроенный DragHandler Embla: фильтрует правую кнопку мыши,
// гасит click после драга > dragThreshold (10px по умолчанию — как
// MOVE_THRESHOLD карточек/папок) и ловит mouseup на ownerDocument, так что
// «мышиный мост» siema-версии (filterNonPrimary/swallowDragClick/
// finishMissedDrag) не нужен. Доводку после отпускания (релиз) DragHandler
// ведёт своей парой (speed 15–25, friction 0.68 — медленный хвост);
// релиз перехватываем по событию движка pointerUp (см. handlePointerUp) и
// переводим доезд на DRIVE-пару — выбор цели (снап по силе флика)
// остаётся за Embla.
// Непрерывная позиция жеста (капсула островка едет за пальцем) читается из
// api.scrollProgress() в rAF-цикле: слайды 100% ширины, прогресс 0..1 между
// первым и последним, позиция = progress * (count - 1).
import { useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type * as React from 'react';
import EmblaCarousel from 'embla-carousel';
import type { EmblaCarouselType } from 'embla-carousel';

// Программные доезды (goTo, рост цепочки) идут напрямую через ScrollBody со
// СВОЕЙ парой (friction, duration), а не options.duration/options.friction.
// Та же пара перехватывает доводку после отпускания свайпа (релиз
// DragHandler — по событию pointerUp, см. handlePointerUp). Движок —
// интегратор 2-го порядка:
// хвост доезда на критическом демпфировании убывает как √friction за кадр,
// поэтому при базовой friction 0.68 даже критическая длительность (~22)
// даёт медленный хвост (доезд ~0.7–0.8с, см. goTo). Сниженная friction 0.5
// с критической длительностью ~6 (порог ≈5.8) ускоряет видимый доезд до
// ~0.4–0.5с на любой дистанции и остаётся монотонным (перелёт 0 — замерено
// на движке). Мгновенный доезд (duration=0, prefers-reduced-motion) — jump.
const DRIVE_FRICTION = 0.5;
const DRIVE_DURATION = 6;

export interface SwipeStripHandle {
  /** Программный переезд: animate=true — с плавным монотонным доездом
      движка (пара DRIVE_FRICTION/DRIVE_DURATION; при duration=0 — прыжок),
      false — jump. onchange/onsettle отработают как обычно. */
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
  /** 0 — программные переходы мгновенные (prefers-reduced-motion); любое
      ненулевое — анимированный доезд. Фактическое время анимации задаёт
      НЕ это значение, а пара (DRIVE_FRICTION, DRIVE_DURATION) на ScrollBody
      (см. шапку): у Embla options.duration — не «время в мс», а
      коэффициент мягкости физики, и при нём (÷40) дальней доезд перелетает
      цель. Проп сохранён как переключатель «анимация/прыжок». */
  duration?: number;
  /** Режим кросс-фейда: контент не едет вбок — слайды проявляются друг
      через друга (прозрачность максимальна на середине свайпа: оба слайда
      по 0.5, дальше уходящий гаснет, приходящий проявляется). Движение
      ленты отключается визуально, но жест и индекс ведёт тот же Embla;
      внутренний слой каждого слайда «стягивается» в общую точку
      (см. fade-блок в эффекте). */
  fade?: boolean;
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
  fade = false,
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
  const latestRef = useRef({ items, keyOf, duration, onchange, onsettle, ondragmove, ondragend });
  latestRef.current = { items, keyOf, duration, onchange, onsettle, ondragmove, ondragend };

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
      // Коэффициент мягкости ScrollBody (не «время в мс»). Программные
      // доезды идут со своей парой (DRIVE_FRICTION/DRIVE_DURATION, см.
      // шапку); options.duration остаётся запасным значением для
      // внутренних api.scrollTo-путей.
      duration: duration === 0 ? 0 : Math.max(1, Math.round(duration / 40)),
    });
    apiRef.current = api;
    lastHostRef.current = host;

    // ── Режим кросс-фейда (fade): контент не едет вбок ─────────────────
    // Слайды проявляются друг через друга: на середине свайпа оба
    // полупрозрачны, дальше уходящий гаснет, приходящий проявляется.
    // Движение ленты визуально отключено (жест и индекс
    // ведёт тот же Embla): transform контейнера больше не пишется
    // (translate.toggleActive(false)), а каждый слайд «стягивается» в общую
    // точку transform'ом ВНУТРЕННЕГО слоя (-i·ширина). Именно внутреннего,
    // а не самого слайда: getBoundingClientRect слайдов Embla использует для
    // замеров (snaps/размеры) — transform ребёнка их не исказит, поэтому
    // re-measure при ресайзе остаётся корректным. Прозрачность/видимость
    // и «приём» кликов — тоже на внутреннем слое.
    //
    // Кадры берём у самого движка, а не своим rAF-циклом. Embla эмитит
    // 'scroll' в каждом render'е, пока лента не встала (и во время драга, и
    // во время доезда), причём ПОСЛЕ записи offsetLocation — scrollProgress
    // в обработчике уже свежий. Свой цикл пришлось бы останавливать и
    // запускать по флагам (жест, «прогресс не менялся N кадров»), и любой
    // пропущенный сигнал оставлял бы ленту с застывшим слайдом: смена экрана
    // «не срабатывает», фейда нет вовсе, а оживает всё только со следующего
    // касания (его старт заново применял фейд). События движка такой
    // возможности не дают:
    //  • 'scroll' — движение (драг и доезд) → фейд по текущему прогрессу,
    //    кадр в кадр с движком;
    //  • 'select' — смена слайда, в том числе программная (тап по табу
    //    островка, goTo) → сразу показываем целевой слайд и выравниваем
    //    сетку (ширина могла измениться);
    //  • 'settle' — движок встал (событие только при отпущенном указателе,
    //    поэтому посреди драга не срабатывает) → фиксируем ровно целый
    //    слайд, чтобы дробный остаток прогресса не оставлял соседа
    //    полупрозрачным;
    //  • 'reInit'/'resize' — перезамеры → пересчёт сетки; при reInit Embla
    //    пересоздаёт движок (engine = createEngine(...) в activate), у нового
    //    Translate флаг снова «активен» и он тут же пишет transform
    //    контейнера — событие reInit эмитится сразу после activate,
    //    синхронно, ещё до кадра отрисовки, поэтому успеваем вернуть пустой
    //    transform без видимого скачка.
    let fadeW = 0;
    let fadeDebugIndex = -1;
    // Диагностика режима (по требованию): в консоли браузера выполнить
    // localStorage.setItem('todo.fadeDebug', '1') и перезагрузить страницу —
    // пойдут сообщения [fade] (режим включён, ширина слайда, число слоёв,
    // текущая позиция). Отличает «новый код не доехал до браузера» от
    // проблемы геометрии.
    const fadeDebug = fade && window.localStorage.getItem('todo.fadeDebug') === '1';

    /** Внутренние слои слайдов (первый ребёнок каждого .swipe-strip-slide). */
    const fadeInnerNodes = (): HTMLElement[] => {
      const out: HTMLElement[] = [];
      for (const slide of api.slideNodes()) {
        const inner = slide.firstElementChild;
        if (inner instanceof HTMLElement) out.push(inner);
      }
      return out;
    };
    /** Позиция ленты дробным индексом (0..n-1) — как в drag-трекере. */
    const fadePos = (): number => {
      const n = api.slideNodes().length;
      return n < 2 ? 0 : api.scrollProgress() * (n - 1);
    };
    /** Статичное «стягивание» всех слоёв в одну точку (ширина меняется на
        ресайзе). Отдельно от applyFade: transform константен для позиции.
        Ширину берём у самого слайда (flex: 0 0 100% — слайды равны
        вьюпорту), а не у вьюпорта: сетка обязана скомпенсировать смещение
        именно слайда (i·ширина). */
    const syncFadeGrid = (): void => {
      const first = api.slideNodes()[0];
      const width = first === undefined ? 0 : first.getBoundingClientRect().width;
      fadeW = width > 0 ? width : viewport.clientWidth;
      const nodes = fadeInnerNodes();
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].style.transform = `translate3d(${(-i * fadeW).toFixed(2)}px,0,0)`;
      }
    };
    const applyFade = (p: number): void => {
      // Нечисловой прогресс (случаться не должен, но цена проверки — ноль):
      // NaN в style.opacity браузер отбрасывает, слой остаётся с прежними
      // стилями — молча залипший кадр.
      if (!Number.isFinite(p)) return;
      // Ширина ещё не измерена (сеть/скрытый контейнер на старте) — лечим
      // при первом же применении, иначе слои «стянуты» в ноль и видны не там.
      if (fadeW <= 0) syncFadeGrid();
      const nodes = fadeInnerNodes();
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        const d = Math.abs(i - p);
        if (d <= 0.0005) {
          el.style.opacity = '1';
          el.style.visibility = 'visible';
          el.style.pointerEvents = 'auto';
        } else if (d >= 1) {
          el.style.opacity = '0';
          el.style.visibility = 'hidden';
          el.style.pointerEvents = 'none';
        } else {
          // Кросс-фейд: на середине оба слайда по 0.5 непрозрачности (дальше
          // уходящий гаснет, приходящий проявляется).
          el.style.opacity = (1 - d).toFixed(3);
          el.style.visibility = 'visible';
          el.style.pointerEvents = 'none';
        }
      }
      if (fadeDebug) {
        const idx = Math.round(p);
        if (idx !== fadeDebugIndex) {
          fadeDebugIndex = idx;
          console.debug('[fade]', {
            slide: idx,
            pos: Number(p.toFixed(3)),
            slideW: Math.round(fadeW),
            layers: nodes.length,
          });
        }
      }
    };
    /** Фейд по текущему прогрессу — обработчик движения движка. */
    const applyFadeNow = (): void => applyFade(fadePos());
    /** Пересчёт сетки и применение (старт/ресайз/reInit). Заодно повторно
        отключает translate: при reInit Embla пересоздаёт движок и у нового
        Translate флаг снова «активен» (см. шапку блока). */
    const relayoutFade = (): void => {
      if (!fade) return;
      api.internalEngine().translate.toggleActive(false);
      api.containerNode().style.transform = '';
      syncFadeGrid();
      applyFadeNow();
      if (fadeDebug) {
        console.debug('[fade] включён', {
          slides: api.slideNodes().length,
          slideW: Math.round(fadeW),
        });
      }
    };
    if (fade) {
      relayoutFade();
      api.on('reInit', relayoutFade);
      api.on('resize', relayoutFade);
      api.on('scroll', applyFadeNow);
    }

    const handleSelect = (): void => {
      const idx = api.selectedScrollSnap();
      curIndexRef.current = idx;
      latestRef.current.onchange?.(idx);
      scheduleSettle(idx);
      // Смена слайда (в том числе программная — тап по табу островка):
      // сразу показать целевой слайд и выровнять сетку по текущей ширине.
      if (fade) {
        syncFadeGrid();
        applyFadeNow();
      }
    };
    /** settle движка: смена уровня родителю + точная фиксация слайда. */
    const handleFadeSettle = (): void => {
      flushSettle();
      // Остаток дробного прогресса (interpolated offsetLocation) не должен
      // оставлять соседний слайд полупрозрачным — фиксируем целый слайд.
      if (fade) applyFade(Math.round(fadePos()));
    };
    api.on('select', handleSelect);
    api.on('settle', handleFadeSettle);

    // Релиз драга (свайп между топиками, свайп-выход из папки) DragHandler
    // ведёт СВОЕЙ парой (speed 15–25 при friction 0.68 — медленный хвост;
    // константы движка, опциями не задаются — см. шапку). Перехватываем её
    // на DRIVE-пару по штатному событию pointerUp: оно эмитится в up()
    // DragHandler ПОСЛЕ того, как тот поставил свою пару и выставил target
    // (scrollTo.distance — выбор снапа по силе флика) и запустил анимацию,
    // но ДО первого кадра доводки (первый seek происходит в следующем
    // rAF-тике). Смена (friction, duration) до первого кадра только
    // ускоряет текущий доезд, не трогая выбор цели. Порядок DOM-слушателей
    // значения не имеет (у мыши up() на window регистрируется в момент
    // down() — позже наших; у тача Embla держит touchend на viewport —
    // внутри host): событие приходит из движка, а не из DOM-фазы.
    const handlePointerUp = (): void => {
      const engine = api.internalEngine();
      engine.scrollBody.useFriction(DRIVE_FRICTION).useDuration(DRIVE_DURATION);
    };
    api.on('pointerUp', handlePointerUp);

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
        // Перехват пары релиза тут не нужен: его делает handlePointerUp
        // (событие движка в момент up() DragHandler — см. там).
        const finalPos = Math.abs(lastMovePos - lastDragPos) > DRAG_POS_EPS ? lastMovePos : undefined;
        latestRef.current.ondragend?.(finalPos);
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
          // Рост цепочки — та же пара (friction, duration), что в goTo
          // (api.scrollTo перелетал бы цель, см. комментарий там).
          // duration=0 (prefers-reduced-motion) — мгновенный jump.
          const engine = api.internalEngine();
          engine.scrollBody
            .useFriction(DRIVE_FRICTION)
            .useDuration(duration === 0 ? 0 : DRIVE_DURATION);
          engine.scrollTo.index(target, 0);
        });
      });
    }

    return () => {
      if (growthRaf !== 0) cancelAnimationFrame(growthRaf);
      if (settleTimer !== undefined) clearTimeout(settleTimer);
      api.off('select', handleSelect);
      api.off('settle', handleFadeSettle);
      api.off('pointerUp', handlePointerUp);
      for (const off of removeTrack) off();
      if (fade) {
        // Возврат к обычному режиму (переключение настройки) или уход со
        // страницы: снимаем фейд со слоёв, отдаём transform обратно
        // движку, чтобы следующий прогон effect'а начался с чистого листа.
        api.off('reInit', relayoutFade);
        api.off('resize', relayoutFade);
        api.off('scroll', applyFadeNow);
        for (const el of fadeInnerNodes()) el.removeAttribute('style');
        api.internalEngine().translate.toggleActive(true);
      }
      api.destroy();
      if (apiRef.current === api) apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- рефы и колбэки через latestRef
  }, [planKey, draggable, duration, scrollSel, fade]);

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
        // Анимированный доезд — напрямую через движок, а не api.scrollTo:
        // api.scrollTo всегда ставит длительность ScrollBody из
        // options.duration (~9 при duration=360мс). При базовой friction
        // 0.68 и такой длительности физика Embla НЕДОДЕМПФИРОВАНА (порог
        // критического демпфирования ≈22): на дальней дистанции (клик по
        // табу через несколько топиков) скорость накапливается, лента
        // перелетает цель и пружинно возвращается («наезд на последующий
        // топик») — и со стоянки тоже, гашение скорости не спасает.
        // (Свайп-релиз не показывал этого заметно: Embla режет его дистанцию
        // до соседнего снапа, а его доводку мы и так перехватываем на ту же
        // пару — см. handlePointerUp.) Хвост доезда на критическом
        // демпфировании убывает как √friction за кадр — чтобы доезд был
        // быстрым И монотонным, ведём его со сниженной friction (0.5) и
        // критической длительностью (~6; порог ≈5.8): перелёт 0, видимый
        // доезд ~0.4–0.5с на любой дистанции (замерено на движке).
        // Внутренний движок — официальный API Embla (на нём строятся её
        // плагины); ScrollBody/EngineType публичны в типах.
        if (animate && latestRef.current.duration !== 0) {
          const engine = api.internalEngine();
          engine.scrollBody.useFriction(DRIVE_FRICTION).useDuration(DRIVE_DURATION);
          engine.scrollTo.index(target, 0);
        } else {
          api.scrollTo(target, true);
        }
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
      className={fade ? 'swipe-strip-host swipe-strip-fade block h-full w-full' : 'swipe-strip-host block h-full w-full'}
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
              {/* Внутренний слой: в fade-режиме именно на нём живут
                  transform-«стягивание» и прозрачность — слайд
                  остаётся нетронутым, чтобы замеры Embla не сбились. */}
              <div className="swipe-strip-slide-inner h-full">{children(item, index)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
