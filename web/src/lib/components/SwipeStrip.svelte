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
