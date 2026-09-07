<script lang="ts" generics="T">
  // Горизонтальная лента свайпов на базе siema (npm, ~13КБ) — замена SwiperJS
  // ради лёгкости и простоты (см. CHANGELOG, этап 50). Слайд = элемент items.
  //
  // Почему не `{#each}` внутри контейнера siema: buildSliderFrame чистит
  // контейнер через selector.innerHTML='' и заворачивает слайды во float-
  // обёртки sliderFrame — якорь реконсиляции Svelte-каждого уничтожается, и
  // любая структурная мутация списка ломает DOM. Поэтому слайды живут в
  // keyed-поддереве, которое при изменении списка перемонтируется ЦЕЛИКОМ по
  // плану (поле planKey/planIndex/planAnimateTo), а вертикальные скроллы
  // живых слайдов (scrollSel) переносятся между пересборками (скролл уровня
  // переживает вход/выход из папок — keyed each в Swiper-версии делал то же).
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

  import type { Snippet } from 'svelte';
  import Siema from 'siema';

  interface Props<T> {
    /** Слайды в порядке следования. */
    items: T[];
    /** Стабильный ключ слайда (id топика/уровня) — пересборка по нему. */
    keyOf: (item: T, index: number) => string;
    /** Контент слайда. */
    children: Snippet<[T, number]>;
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

  let {
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
  }: Props<T> = $props();

  // ── План пересборки ────────────────────────────────────────────────────
  // Сигнатура списка (состав+порядок) — ключ перемонтирования keyed-поддерева.
  const sigOf = (): string => items.map((it, i) => keyOf(it, i)).join('\u0000');

  /** Ключ текущей пересборки (начальное значение — первое монтирование). */
  let planKey = $state(sigOf());
  /** Стартовый слайд после пересборки. */
  let planIndex = initialIndex;
  /** >= 0 — после старта анимированно доехать до этого слайда (рост цепочки). */
  let planAnimateTo = -1;
  /** Скроллы живых слайдов старого DOM (ключ слайда → scrollTop). */
  let planRestore = new Map<string, number>();
  /** Длина предыдущего списка — отличаем рост цепочки от прочих изменений. */
  let prevLen = items.length;

  // ── Состояние siema ────────────────────────────────────────────────────
  let hostEl: HTMLDivElement | undefined = $state();
  let siema: Siema | undefined = $state();
  /** Хост текущего инстанса (сравнением отличаем пересборку от смены конфига). */
  let lastHost: HTMLElement | undefined;
  /** Текущий индекс — переживает пересоздание инстанса (конфиг-эффект). */
  let curIndex = 0;

  function slideNodes(host: HTMLElement): { key: string; el: HTMLElement }[] {
    const out: { key: string; el: HTMLElement }[] = [];
    for (const el of host.querySelectorAll<HTMLElement>('.swipe-strip-slide')) {
      const key = el.dataset.stripKey;
      if (key !== undefined) out.push({ key, el });
    }
    return out;
  }

  // Пересборка: список изменился — снять скроллы со СТАРОГО DOM ($effect.pre
  // бежит до обновления DOM) и сменить ключ keyed-поддерева. Рост цепочки
  // (вход в папку) планирует старт на слайде родителя и анимированный доезд
  // к глубокому; прочие изменения — сразу на initialIndex, без анимации.
  $effect.pre(() => {
    const s = sigOf();
    if (s === planKey) return;

    const host = hostEl;
    if (host !== undefined && host.isConnected) {
      const captured = new Map<string, number>();
      for (const { key, el } of slideNodes(host)) {
        const sc = el.querySelector<HTMLElement>(scrollSel);
        if (sc !== null) captured.set(key, sc.scrollTop);
      }
      planRestore = captured;
    }

    const len = items.length;
    const growing = prevLen > 0 && len > prevLen && animateGrowth;
    planIndex = growing ? len - 2 : Math.min(initialIndex, Math.max(0, len - 1));
    planAnimateTo = growing ? len - 1 : -1;
    prevLen = len;
    planKey = s;
  });

  // Жизненный цикл siema на текущем keyed-хосте. Зависимости: хост (новая
  // пересборка) и конфиг конструктора (draggable/duration/threshold). При
  // перезапуске cleanup сначала гасит старый инстанс (restoreMarkup=true —
  // слайды возвращаются в контейнер «как были»), затем тело строит новый.
  // Для нового хоста стартуем с planIndex (и доезжаем до planAnimateTo при
  // росте цепочки), для старого — сохраняем текущую позицию (curIndex).
  $effect(() => {
    const host = hostEl;
    if (host === undefined) return;

    const fresh = host !== lastHost;
    const index = fresh ? planIndex : curIndex;

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
        curIndex = instance.currentSlide;
        onchange?.(instance.currentSlide);
        scheduleSettle(instance.currentSlide);
      },
    });
    siema = instance;
    lastHost = host;

    // Мышиный драг (мост поверх хрупких mouse-хендлеров siema): siema не
    // проверяет кнопку в mousedown (правый клик начал бы драг) и ловит mouseup
    // только на хосте — отпускание над оверлеем поверх ленты (страница
    // заметки, контекстное меню) оставило бы pointerDown «залипшим», и слайд
    // ехал бы за курсором без нажатой кнопки. Чиним точечно:
    //  • правый/средний mousedown глушим в capture на хосте — siema (bubble)
    //    его не видит; левый клик, pointer-события и contextmenu не
    //    затрагиваются (меню карточек/папок открываются на contextmenu);
    //  • mouseup дублируем на window в bubble-фазе: siema обрабатывает
    //    отпускание на хосте первым (хост глубже window) и сам сбрасывает
    //    жест, сюда попадаем только когда siema события не видел — завершаем
    //    жест его же методами (как mouseupHandler: pointerDown=false → cursor →
    //    enableTransition → updateAfterDrag при сдвиге → clearDrag).
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
      /** Позиция, прочитанная в последнем move-событии: это точка, где палец/
          курсор находится СЕЙЧАС — от неё siema начнёт доезд при отпускании.
          (В момент отпускания translate прочитать уже нельзя: siema в своём
          touchend/mouseup сразу ставит style.transform на ЦЕЛЕВОЙ слайд,
          CSS-transition анимирует только рендер — rAF прочитал бы финал.) */
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
        // чтобы родитель поставил капсулу ровно в неё (отдельным флашем,
        // а не в батче с обнулением — иначе Svelte схлопнет обе записи)
        // и доехал к активному слайду синхронно с доводкой siema.
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
    const restore = planRestore;
    planRestore = new Map();
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
    const target = planAnimateTo;
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
      if (siema === instance) siema = undefined;
    };
  });

  // ── Imperative API (bind:this) ─────────────────────────────────────────
  /** Программный переезд: animate=true — с CSS-transition (длительность из
      duration), false — мгновенно. onchange/onsettle отработают как обычно. */
  export function goTo(index: number, animate: boolean): void {
    const s = siema;
    if (s === undefined) return;
    const target = Math.max(0, Math.min(index, items.length - 1));
    if (target === s.currentSlide) return;
    if (animate) s.enableTransition();
    else s.disableTransition();
    s.goTo(target);
  }

  /** Текущий индекс слайда (-1 — лента ещё не инициализирована). */
  export function getIndex(): number {
    return siema?.currentSlide ?? -1;
  }

  /** Количество слайдов. */
  export function getCount(): number {
    return items.length;
  }
</script>

{#key planKey}
  <div
    bind:this={hostEl}
    class="swipe-strip-host block h-full w-full"
    role="group"
    aria-roledescription="карусель"
  >
    {#each items as item, index (keyOf(item, index))}
      <div class="swipe-strip-slide block h-full" data-strip-key={keyOf(item, index)}>
        {@render children(item, index)}
      </div>
    {/each}
  </div>
{/key}

<style>
  /* siema строит sliderFrame и float-обёртки динамически, без классов —
     цепочку высот задаём структурно: host (h-full) → frame → обёртки →
     .swipe-strip-slide (h-full). Без этого слайды схлопнулись бы по высоте. */
  :global(.swipe-strip-host > div) {
    height: 100%;
  }
  :global(.swipe-strip-host > div > div) {
    height: 100%;
  }
</style>
