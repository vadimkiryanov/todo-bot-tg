<script lang="ts">
  // «Островок» табов топиков: стеклянная плавающая панель (glass style, как
  // островок в Telegram) над списком заметок, фиксирована при скролле.
  // Тап — выбрать топик (свайпом по списку тоже переключается), долгий тап
  // по табу — меню топика (TopicMenu: создать/переименовать/удалить).
  // Счётчик заметок — как в боте.
  import { navigation } from '../stores/navigation.svelte';
  import { topicsStore } from '../stores/topics.svelte';
  import { openTopicMenu } from '../stores/topic-menu.svelte';
  import { suppressNextClick } from '../utils/click';

  let {
    /** Выбор топика (родитель добавляет анимацию въезда списка). */
    onSelect,
  }: { onSelect: (id: number) => void } = $props();

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
    const chip = el.querySelector<HTMLElement>(`[data-topic-id="${id}"]`);
    if (chip === null) return;
    // Откладываем на кадр: позиции табов финальны после отрисовки
    // (список топиков мог только что обновиться).
    requestAnimationFrame(() => {
      const pad = 8;
      const cr = el.getBoundingClientRect();
      const c = chip.getBoundingClientRect();
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
      <button
        type="button"
        role="tab"
        data-topic-id={topic.id}
        aria-selected={topic.id === navigation.activeTopicID}
        class="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm transition-[background-color] {topic.id ===
        navigation.activeTopicID
          ? 'bg-accent-strong text-white'
          : 'text-content'}"
        onpointerdown={(e) => handlePointerDown(topic.id, e)}
        onpointerup={clearTimer}
        onpointercancel={clearTimer}
        onpointerleave={clearTimer}
        onpointermove={handlePointerMove}
        onclick={() => onTap(topic.id)}
      >
        <span class="max-w-36 truncate">{topic.name}</span>
        {#if topic.note_count > 0}
          <span class="shrink-0 text-xs opacity-70">{topic.note_count}</span>
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
