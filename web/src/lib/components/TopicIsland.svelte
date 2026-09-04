<script lang="ts">
  // «Островок» табов топиков: стеклянная плавающая панель (glass style, как
  // островок в Telegram) над списком заметок, фиксирована при скролле.
  // Тап — выбрать топик (свайпом по списку тоже переключается), долгий тап
  // по табу — меню топика (TopicMenu: создать/переименовать/удалить).
  // Счётчик заметок — как в боте.
  // Режим «путь в табе» (pathInTab, настройка): активный таб при входе
  // в папку расширяется в хлебные крошки по ширине своего текста, оставаясь
  // обычной акцентной таблеткой, и показывает путь из корня («Работа ›
  // Проект › Задачи»); длинный путь ужимается до влезающего — корень и
  // активная папка видны всегда, середина маскируется «…».
  // Тап по нему открывает шторку папок. Отдельная строка-крошка
  // (FolderStrip) в этом режиме не рисуется.
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
  }: {
    onSelect: (id: number) => void;
    pathInTab?: boolean;
    onOpenFolders?: () => void;
  } = $props();

  /** Имена папок от корня активного топика до активной папки включительно. */
  const chainNames = $derived(folderChain().map((f) => f.name));

  let longPressTimer: number | undefined;
  let longPressFired = false;
  let startX = 0;
  let startY = 0;

  const LONG_PRESS_MS = 500;
  const MOVE_THRESHOLD = 10;

  /** Контейнер ленты табов — для автопрокрутки к активному табу. */
  let islandEl = $state<HTMLDivElement | undefined>();

  // Автопрокрутка островка: при смене активного топика (клик по табу, свайп
  // по списку, восстановление сессии) лента следует за активным табом —
  // центрирует его, если тот вышел за пределы видимой области.
  // Без smooth-анимации: длительная программная прокрутка «перехватывает»
  // жест и ручной скролл ленты на мобилке перестаёт работать.
  $effect(() => {
    const id = navigation.activeTopicID;
    const el = islandEl;
    if (id === null || el === undefined) return;
    // Вход/выход из папки меняет ширину активного таба (обычный ⇄ крошки) —
    // лента перестраивается, поэтому следим и за папкой: эффект
    // перезапускается при смене пути.
    const inFolder = navigation.activeFolderID !== null && chainNames.length > 0;
    const chip = el.querySelector<HTMLElement>(`[data-topic-id="${id}"]`);
    if (chip === null) return;
    // Откладываем на кадр: позиции табов финальны после отрисовки
    // (список топиков мог только что обновиться).
    requestAnimationFrame(() => {
      const pad = 8;
      const cr = el.getBoundingClientRect();
      const c = chip.getBoundingClientRect();
      if (inFolder) {
        // Расширенный таб-крошки прижимаем к левому краю островка: путь
        // обрезается многоточием в конце, поэтому важно показать начало
        // (имя топика). Если таб влезает целиком — ленту не трогаем.
        if (c.left >= cr.left + pad && c.right <= cr.right - pad) return; // уже виден
        el.scrollTo({ left: el.scrollLeft + (c.left - cr.left) - pad, behavior: 'auto' });
        return;
      }
      if (c.left >= cr.left + pad && c.right <= cr.right - pad) return; // уже виден
      el.scrollTo({
        left: el.scrollLeft + (c.left - cr.left) - (cr.width - c.width) / 2,
        behavior: 'auto',
      });
    });
  });

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
    class="island-glass no-scrollbar pointer-events-auto mx-auto flex w-full max-w-md items-center gap-1 overflow-x-auto rounded-full px-1.5 py-1.5"
    role="tablist"
  >
    {#each topicsStore.topics as topic (topic.id)}
      <!-- Подсветка — по фактическому активному топику либо по тому, куда
           едет свайпер после отпускания (pendingTopicID): таб «догоняет» жест
           сразу, не дожидаясь конца доводки. -->
      {@const active = topic.id === (navigation.pendingTopicID ?? navigation.activeTopicID)}
      {@const extended =
        active && pathInTab && navigation.activeFolderID !== null && chainNames.length > 0}
      <button
        type="button"
        role="tab"
        data-topic-id={topic.id}
        aria-selected={active}
        title={extended ? `${topic.name} › ${chainNames.join(' › ')}` : topic.name}
        class="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm transition-[background-color] {extended
          ? 'shrink-0 max-w-full bg-accent-strong text-white'
          : active
            ? 'shrink-0 bg-accent-strong text-white'
            : 'shrink-0 text-content'}"
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
</style>
