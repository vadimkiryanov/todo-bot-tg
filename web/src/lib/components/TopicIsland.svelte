<script lang="ts">
  // «Островок» табов топиков: стеклянная плавающая панель (glass style, как
  // островок в Telegram) над списком заметок, фиксирована при скролле.
  // Тап — выбрать топик (свайпом по списку тоже переключается), долгий тап
  // по табу — меню топика (TopicMenu: создать/переименовать/удалить).
  // Счётчик заметок — как в боте.
  //
  // Подсветка — единая акцентная капсула (позади табов), а не фон кнопки:
  // при свайпе контента она непрерывно едет за пальцем между табами
  // (dragPos от SwipeStrip), а при переключении — плавно переезжает на
  // новый таб синхронно с доводкой ленты контента (та же длительность
  // duration). Переезжает сама ПОЗИЦИЯ капсулы (rAF-доезд), и текст табов
  // перекрашивается в каждом кадре следом за ней (белый ⇄ цвет контента) —
  // как в Telegram: даже если свайп отпущен на полпути, перекраска не
  // «обрывается» (не скачет раньше капсулы — обе едут к цели от точки
  // отпускания, как и лента контента).
  //
  // Лента островка подкручивается так, чтобы активный таб и его сосед по
  // направлению перехода были видны целиком: следующий свайп не «перескакивает»
  // через край контейнера. Подкрутка анимируется своей rAF-прокруткой
  // (длительность duration) и отменяется, если пользователь сам начал
  // скроллить ленту пальцем — ручной скролл не перехватывается.
  //
  // Режим «путь в табе» (pathInTab, настройка): активный таб при входе
  // в папку расширяется в хлебные крошки по ширине своего текста, оставаясь
  // обычной акцентной таблеткой, и показывает путь из корня («Работа ›
  // Проект › Задачи»); длинный путь ужимается до влезающего — корень и
  // активная папка видны всегда, середина маскируется «…».
  // Тап по нему открывает шторку папок. Отдельная строка-крошка
  // (FolderStrip) в этом режиме не рисуется.
  import { untrack } from 'svelte';
  import { folderChain } from '../stores/folders.svelte';
  import { navigation } from '../stores/navigation.svelte';
  import { topicsStore } from '../stores/topics.svelte';
  import { openTopicMenu } from '../stores/topic-menu.svelte';
  import { suppressNextClick } from '../utils/click';
  import CrumbPath from './CrumbPath.svelte';

  let {
    /** Выбор топика (родитель добавляет анимацию въезда списка). */
    onSelect,
    /** Режим «путь в табе»: путь в папке показывается в активном табе. */
    pathInTab = false,
    /** Открыть шторку папок (тап по расширенному табу в папке). */
    onOpenFolders,
    /** Непрерывная позиция свайпа контента (дробный индекс таба, из
        SwipeStrip.ondragmove): капсула следует за пальцем. null — покой. */
    dragPos = null,
    /** Длительность переезда капсулы и подкрутки ленты, мс (0 — мгновенно:
        prefers-reduced-motion). Синхронизирована с доездом ленты контента. */
    duration = 360,
  }: {
    onSelect: (id: number) => void;
    pathInTab?: boolean;
    onOpenFolders?: () => void;
    dragPos?: number | null;
    duration?: number;
  } = $props();

  /** Имена папок от корня активного топика до активной папки включительно. */
  const chainNames = $derived(folderChain().map((f) => f.name));

  let longPressTimer: number | undefined;
  let longPressFired = false;
  let startX = 0;
  let startY = 0;

  const LONG_PRESS_MS = 500;
  const MOVE_THRESHOLD = 10;
  /** Запас до краёв ленты при подкрутке (как отступ px-1.5 панели). */
  const SCROLL_PAD = 8;
  /** Порог движения пальца по ленте, после которого reveal-подкрутка
      отменяется (жест считается ручным скроллом). */
  const CANCEL_MOVE_PX = 8;

  /** Контейнер ленты табов. */
  let islandEl = $state<HTMLDivElement | undefined>();

  // ── Геометрия табов (капсула и reveal) ─────────────────────────────────
  interface TabGeo {
    left: number;
    top: number;
    width: number;
    height: number;
  }

  /** Позиции табов в контентных координатах ленты (offsetLeft/offsetTop
      от островка — он relative). Пересобирается при изменении списка,
      расширении активного таба (крошки) и ресайзе. */
  let tabsGeo = $state<TabGeo[]>([]);

  /** Индекс фактически активного таба (-1 — не выбран). */
  const activeIdx = $derived.by(() => {
    const id = navigation.pendingTopicID ?? navigation.activeTopicID;
    if (id === null) return -1;
    return topicsStore.topics.findIndex((t) => t.id === id);
  });

  function measureTabs(): void {
    const el = islandEl;
    if (el === undefined) return;
    const buttons = el.querySelectorAll<HTMLElement>('button[data-topic-id]');
    // DOM может быть не синхронизирован со списком (пересборка) — ждём
    // следующего эффекта, иначе капсула встанет под чужие табы.
    if (buttons.length !== topicsStore.topics.length) return;
    const geo: TabGeo[] = [];
    for (const b of buttons) {
      geo.push({
        left: b.offsetLeft,
        top: b.offsetTop,
        width: b.offsetWidth,
        height: b.offsetHeight,
      });
    }
    tabsGeo = geo;
  }

  // Измерение после отрисовки: список/крошки меняют ширину табов. CrumbPath
  // ужимает длинный путь за несколько кадров (drops по rAF) — догоняем
  // ResizeObserver'ом на кнопках (срабатывает на каждое изменение ширины).
  $effect(() => {
    void topicsStore.topics;
    void chainNames;
    void navigation.activeFolderID;
    void pathInTab;
    const el = islandEl;
    if (el === undefined) return;
    const ro = new ResizeObserver(() => measureTabs());
    ro.observe(el);
    for (const b of el.querySelectorAll<HTMLElement>('button[data-topic-id]')) {
      ro.observe(b);
    }
    measureTabs();
    // Первый кадр ужатия крошек — до него RO на кнопке ещё не сработал.
    const raf = requestAnimationFrame(() => measureTabs());
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  });

  // ── Капсула-подсветка ──────────────────────────────────────────────────
  /** Непрерывная позиция капсулы — дробный индекс таба (та же координата,
      что dragPos свайпа контента). Во время свайпа — за пальцем (пишется из
      dragPos каждый кадр жеста), в покое — плавно доезжает до активного
      таба. Доезжает САМА позиция (rAF), а не left/width через CSS-transition:
      перекраска текста (whites) считается от той же позиции в каждом кадре,
      поэтому при отпускании свайпа на полпути капсула и текст едут к цели
      синхронно с доездом ленты контента (siema тоже стартует от точки
      отпускания) — текст не перекрашивается скачком раньше капсулы.
      -1 — позиция не определена (капсулу не рисовать). */
  let pillPos = $state(-1);

  let pillAnimRAF = 0;

  function stopPillAnim(): void {
    if (pillAnimRAF !== 0) {
      cancelAnimationFrame(pillAnimRAF);
      pillAnimRAF = 0;
    }
  }

  /** Доезд капсулы к позиции target от текущей (точки отпускания после
      драга / старого таба при переключении). Мгновенно при duration <= 0
      (prefers-reduced-motion) и при первом появлении (позиции ещё нет). */
  function animatePillTo(target: number): void {
    stopPillAnim();
    const from = untrack(() => pillPos);
    if (from < 0 || untrack(() => duration) <= 0 || Math.abs(from - target) < 0.005) {
      pillPos = target;
      return;
    }
    const dur = untrack(() => duration);
    const t0 = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3); // ease-out — как доводка контента
      pillPos = from + (target - from) * e;
      pillAnimRAF = k < 1 ? requestAnimationFrame(step) : 0;
    };
    pillAnimRAF = requestAnimationFrame(step);
  }

  /** Состояние капсулы: левый таб пары (i), доля перехода (f), координаты.
      null — капсулу не рисовать (табов нет / позиция не определена). */
  const pillState = $derived.by(() => {
    const n = tabsGeo.length;
    if (n === 0) return null;
    const raw = pillPos;
    if (raw < 0 || Number.isNaN(raw)) return null;
    const p = Math.min(Math.max(raw, 0), n - 1);
    const i = Math.floor(p);
    const f = p - i;
    const g0 = tabsGeo[i];
    const g1 = tabsGeo[Math.min(i + 1, n - 1)];
    const k = f > 0 && i + 1 < n ? f : 0;
    return {
      i,
      f: k > 0 ? f : 0,
      left: g0.left + (g1.left - g0.left) * k,
      width: g0.width + (g1.width - g0.width) * k,
      top: g0.top,
      height: g0.height,
    };
  });

  // Капсула за пальцем: dragPos приходит каждый кадр жеста — позиция пишется
  // напрямую (без анимации), идущий доезд отменяется (не бороться с рукой).
  $effect(() => {
    const p = dragPos;
    if (p === null) return;
    stopPillAnim();
    const n = tabsGeo.length;
    pillPos = n > 0 ? Math.min(Math.max(p, 0), n - 1) : -1;
  });

  // Доезд к активному табу: смена активного топика (свайп/тап/шторка),
  // выход из драга (dragPos → null — стартуем от точки отпускания) и первое
  // появление геометрии. Пока dragPos не null позицией рулит драг-эффект.
  // Cleanup гасит идущий доезд при перезапуске (новая цель) и размонтировании.
  $effect(() => {
    void duration;
    const n = tabsGeo.length;
    if (n > 0) {
      const target = activeIdx;
      if (target >= 0) {
        if (dragPos === null) animatePillTo(target);
      } else if (untrack(() => pillPos) !== -1) {
        // Активного топика нет — капсулу не рисовать.
        pillPos = -1;
      }
    }
    return stopPillAnim;
  });

  /** Белизна текста каждого таба: 1 — белый (под капсулой), 0 — цвет
      контента; промежуточные — во время езды капсулы (перекраска пары). */
  const whites = $derived.by(() => {
    const n = tabsGeo.length;
    if (n === 0) return [];
    const ps = pillState;
    if (ps === null) return Array<number>(n).fill(0);
    const out = Array<number>(n).fill(0);
    if (ps.f === 0) {
      out[ps.i] = 1;
    } else {
      out[ps.i] = 1 - ps.f;
      if (ps.i + 1 < n) out[ps.i + 1] = ps.f;
    }
    return out;
  });

  function textMix(w: number): string {
    const pct = Math.round(w * 100);
    return `color-mix(in srgb, #fff ${pct}%, var(--color-content))`;
  }

  // ── Подкрутка ленты (активный + сосед по направлению видны) ───────────
  /** Направление последней смены активного таба (+1 — следующий в списке). */
  let lastDir: 1 | -1 = 1;
  let lastActiveIdx = -2;

  // Программная анимация scrollLeft (своя, не behavior:'smooth'): reveal
  // должен быть отменяемым — при ручном скролле ленты анимация гасится,
  // иначе боролись бы два «водителя» скролла (баг этапа 32).
  let scrollAnimRAF = 0;
  function cancelScrollAnim(): void {
    if (scrollAnimRAF !== 0) {
      cancelAnimationFrame(scrollAnimRAF);
      scrollAnimRAF = 0;
    }
  }
  function scrollToTarget(target: number): void {
    const el = islandEl;
    if (el === undefined) return;
    cancelScrollAnim();
    if (duration <= 0) {
      el.scrollLeft = target;
      return;
    }
    const from = el.scrollLeft;
    const dist = target - from;
    if (Math.abs(dist) < 0.5) return;
    const t0 = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3); // ease-out
      el.scrollLeft = from + dist * e;
      scrollAnimRAF = k < 1 ? requestAnimationFrame(step) : 0;
    };
    scrollAnimRAF = requestAnimationFrame(step);
  }

  /** Куда доскроллить ленту, чтобы активный таб и его сосед по dir были
      видны целиком (с запасом SCROLL_PAD). null — уже всё видно.
      Координаты табов — контентные: getBoundingClientRect даёт экранные
      (уже сдвинутые на scrollLeft), поэтому к ним добавляется s — иначе
      при ненулевом скролле проверки видимости и цели уезжают на s. */
  function revealTarget(chip: HTMLElement, dir: 1 | -1, inFolder: boolean): number | null {
    const el = islandEl;
    if (el === undefined) return null;
    const pad = SCROLL_PAD;
    const s = el.scrollLeft;
    const view = el.clientWidth;
    const max = Math.max(0, el.scrollWidth - view);
    const cr = el.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const cL = c.left - cr.left + s;
    const cR = c.right - cr.left + s;
    const cVisible = cL >= s + pad && cR <= s + view - pad;

    if (inFolder) {
      // Расширенный таб-крошки: показываем начало пути (имя топика);
      // соседний таб не нужен — в папке внешняя лента контента выключена.
      if (cVisible) return null;
      return Math.max(0, Math.min(cL - pad, max));
    }

    const clamp = (t: number): number => Math.max(0, Math.min(t, max));
    const neighbor =
      dir === 1 ? chip.nextElementSibling : chip.previousElementSibling;
    if (neighbor === null || !(neighbor instanceof HTMLElement)) {
      if (cVisible) return null;
      // Соседа нет (край списка): показать активный таб целиком — если он
      // ушёл вправо, подъезжаем слева, если влево — справа.
      return cR > s + view - pad ? clamp(cL - pad) : clamp(cR - view + pad);
    }
    const n = neighbor.getBoundingClientRect();
    const nL = n.left - cr.left + s;
    const nR = n.right - cr.left + s;
    const nVisible = dir === 1 ? nR <= s + view - pad : nL >= s + pad;
    if (cVisible && nVisible) return null;

    // Окно «активный + сосед» [L, R]: сосед по направлению перехода.
    const L = dir === 1 ? cL - pad : nL - pad;
    const R = dir === 1 ? nR + pad : cR + pad;
    if (R - L <= view) {
      // Влезают вместе: подъезжаем минимально, чтобы окно целиком
      // поместилось (текущая позиция уже внутри — ничего не делаем).
      if (s < R - view) return clamp(R - view);
      if (s > L) return clamp(L);
      return null;
    }
    // Не влезают: активный к краю по направлению — сосед «впереди» виден
    // настолько, насколько помещается (максимум обзора по ходу движения).
    return dir === 1 ? clamp(cL - pad) : clamp(cR - view + pad);
  }

  // Подкрутка при смене активного топика (свайп/клик по табу/шторка/
  // восстановление). Направление — по знаку последней смены: показываем
  // соседа, к которому пойдёт следующий свайп. Отложено на кадр: ширина
  // таба-крошек финальна после отрисовки пути.
  $effect(() => {
    const id = navigation.pendingTopicID ?? navigation.activeTopicID;
    const el = islandEl;
    if (id === null || el === undefined) return;
    // Вход/выход из папки меняет ширину активного таба (обычный ⇄ крошки) —
    // лента перестраивается, поэтому следим и за папкой.
    const inFolder = navigation.activeFolderID !== null && chainNames.length > 0;
    const idx = topicsStore.topics.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const dir: 1 | -1 =
      lastActiveIdx === -2
        ? 1
        : idx > lastActiveIdx
          ? 1
          : idx < lastActiveIdx
            ? -1
            : lastDir;
    lastActiveIdx = idx;
    lastDir = dir;

    const raf = requestAnimationFrame(() => {
      const chip = el.querySelector<HTMLElement>(`[data-topic-id="${id}"]`);
      if (chip === null) return;
      const target = revealTarget(chip, dir, inFolder);
      if (target !== null) scrollToTarget(target);
    });
    return () => cancelAnimationFrame(raf);
  });

  // Отмена reveal-подкрутки ручным скроллом ленты: анимацию гасим только
  // когда палец/курсор реально повёл ленту (по X) — простой тап по табу
  // (pointerdown без движения) подкрутку не прерывает.
  $effect(() => {
    const el = islandEl;
    if (el === undefined) return;
    let tracking = false;
    let downX = 0;
    const onDown = (e: PointerEvent): void => {
      tracking = true;
      downX = e.clientX;
    };
    const onMove = (e: PointerEvent): void => {
      if (!tracking) return;
      if (Math.abs(e.clientX - downX) > CANCEL_MOVE_PX) {
        tracking = false;
        cancelScrollAnim();
      }
    };
    const onUp = (): void => {
      tracking = false;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      cancelScrollAnim();
    };
  });

  // ── Долгий тап: меню топика ────────────────────────────────────────────
  function clearTimer(): void {
    window.clearTimeout(longPressTimer);
  }

  function handlePointerDown(id: number, e: PointerEvent): void {
    if (e.button !== 0) return;
    longPressFired = false;
    startX = e.clientX;
    startY = e.clientY;
    clearTimer();
    longPressTimer = window.setTimeout(() => {
      longPressFired = true;
      suppressNextClick();
      const topic = topicsStore.topics.find((t) => t.id === id);
      if (topic !== undefined) {
        openTopicMenu(topic);
      }
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(e: PointerEvent): void {
    if (longPressTimer === undefined) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
      clearTimer();
    }
  }

  function onTap(id: number): void {
    if (longPressFired) {
      longPressFired = false;
      return;
    }
    if (id !== navigation.activeTopicID) {
      onSelect(id);
      return;
    }
    // Активный таб. В режиме «путь в табе» вход в папку расширяет его —
    // повторный тап открывает шторку папок (замена строки-крошки).
    if (pathInTab && navigation.activeFolderID !== null) {
      onOpenFolders?.();
    }
  }
</script>

{#if topicsStore.topics.length > 0}
  <div
    bind:this={islandEl}
    class="island-glass no-scrollbar pointer-events-auto relative mx-auto flex w-full max-w-md items-center gap-1 overflow-x-auto rounded-full px-1.5 py-1.5"
    role="tablist"
  >
    <!-- Капсула-подсветка: единый акцентный фон позади табов, едет между
         ними при переключении и за пальцем при свайпе контента (dragPos).
         Позиция анимируется покадрово (rAF, см. animatePillTo) — тексту
         табов не нужен отдельный transition: он перекрашивается в каждом
         кадре вместе с капсулой. Появляется после первого измерения
         геометрии — сразу на месте активного таба, без «прилёта» из угла. -->
    {#if pillState !== null}
      <div
        class="island-pill pointer-events-none absolute z-0 rounded-full bg-accent-strong"
        style:left="{pillState.left}px"
        style:top="{pillState.top}px"
        style:width="{pillState.width}px"
        style:height="{pillState.height}px"
        aria-hidden="true"
      ></div>
    {/if}
    {#each topicsStore.topics as topic, index (topic.id)}
      <!-- Активность — по фактическому активному топику либо по тому, куда
           едет свайпер после отпускания (pendingTopicID). Текст красится по
           положению капсулы (whites): белый под ней, цвет контента вне её,
           промежуточные цвета — у пары табов во время езды. -->
      {@const active = topic.id === (navigation.pendingTopicID ?? navigation.activeTopicID)}
      {@const extended =
        active && pathInTab && navigation.activeFolderID !== null && chainNames.length > 0}
      {@const w = whites[index] ?? 0}
      <button
        type="button"
        role="tab"
        data-topic-id={topic.id}
        aria-selected={active}
        title={extended ? `${topic.name} › ${chainNames.join(' › ')}` : topic.name}
        class="relative z-10 flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm {extended
          ? 'max-w-full'
          : ''} {w >= 1 ? 'text-white' : 'text-content'}"
        style:color={w > 0 && w < 1 ? textMix(w) : undefined}
        onpointerdown={(e) => handlePointerDown(topic.id, e)}
        onpointerup={clearTimer}
        onpointercancel={clearTimer}
        onpointerleave={clearTimer}
        onpointermove={handlePointerMove}
        onclick={() => onTap(topic.id)}
      >
        {#if extended}
          <!-- Активный таб в папке: обычная акцентная таблетка, ширина — по
               тексту пути (короткий путь — узкий таб рядом с другими табами,
               длинный упирается в ширину островка). Длинный путь ужимается
               до влезающего: корень (имя топика) и активная папка всегда
               видны, средние сегменты прячутся за «…»; полный путь — в title
               и в шторке папок (тап по табу). -->
          <CrumbPath
            segments={[topic.name, ...chainNames]}
            firstClass="font-semibold"
            restClass="text-white/75"
          />
        {:else}
          <span class="max-w-36 truncate">{topic.name}</span>
          {#if topic.note_count > 0}
            <span class="shrink-0 text-xs opacity-70">{topic.note_count}</span>
          {/if}
        {/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .no-scrollbar {
    scrollbar-width: none;
  }
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  /* Табы островка: долгий тап открывает меню топика — выделение текста
     не нужно; touch-manipulation оставляет горизонтальный скролл ленты. */
  .no-scrollbar,
  .no-scrollbar button {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    touch-action: pan-x;
  }
  /* Капсула-подсветка: rounded-full + фон задаёт класс bg-accent-strong;
     здесь только мягкая тень, отделяющая её от стекла при езде. */
  .island-pill {
    box-shadow:
      inset 0 0 0 0.5px rgb(255 255 255 / 0.08),
      0 1px 2px rgb(0 0 0 / 0.14);
  }
</style>
