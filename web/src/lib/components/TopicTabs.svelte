<script lang="ts">
  // Сетка топиков (шторка «Топики»): тап — выбор топика (шторка не
  // закрывается), долгий тап — меню топика (TopicMenu: создать/переименовать/
  // удалить).
  import { navigation, setActiveTopic } from '../stores/navigation.svelte';
  import { topicsStore } from '../stores/topics.svelte';
  import { openTopicMenu } from '../stores/topic-menu.svelte';
  import { suppressNextClick } from '../utils/click';

  let longPressTimer: number | undefined;
  let longPressFired = false;

  const LONG_PRESS_MS = 500;

  function handlePointerDown(id: number): void {
    longPressFired = false;
    longPressTimer = window.setTimeout(() => {
      longPressFired = true;
      suppressNextClick();
      const topic = topicsStore.topics.find((t) => t.id === id);
      if (topic !== undefined) {
        openTopicMenu(topic);
      }
    }, LONG_PRESS_MS);
  }

  function cancelLongPress(): void {
    window.clearTimeout(longPressTimer);
  }

  function onTap(id: number): void {
    if (longPressFired) {
      longPressFired = false;
      return;
    }
    setActiveTopic(id);
  }
</script>

<div class="shrink-0 px-1 pb-1">
  <!-- Сетка топиков (2 колонки): долгий тап по топику — меню. Высота не
       ограничена изнутри — длинный список раскрывает шторку до 85dvh,
       скроллится сама шторка (Modal). -->
  <div class="topic-grid grid grid-cols-2 gap-2">
      {#each topicsStore.topics as topic (topic.id)}
        <button
          type="button"
          class="flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm transition-[background-color,transform] active:scale-[0.97] {topic.id === navigation.activeTopicID
            ? 'bg-accent-strong text-white'
            : 'bg-background text-content'}"
          onpointerdown={() => handlePointerDown(topic.id)}
          onpointerup={cancelLongPress}
          onpointercancel={cancelLongPress}
          onpointerleave={cancelLongPress}
          onclick={() => onTap(topic.id)}
        >
          <span class="truncate">{topic.name}</span>
          {#if topic.note_count > 0}
            <span class="shrink-0 text-xs opacity-60">{topic.note_count}</span>
          {/if}
        </button>
      {/each}
  </div>
</div>

<style>
  /* Сетка топиков: долгий тап по топику открывает меню — выделение текста
     не нужно (WebKit игнорирует user-select на родителе для текста внутри
     <button>, поэтому задаём и кнопкам). */
  .topic-grid,
  .topic-grid button {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
</style>
