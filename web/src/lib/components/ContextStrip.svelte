<script lang="ts">
  // Компактная строка контекста: «📚 Топик › 📁 Папка › Подпапка».
  // Тап — шторка снизу с полными списками (TopicTabs + FolderBar); долгое
  // нажатие — дропдаун «Создать топик». Шторка не закрывается автоматически
  // при выборе — только вручную (тап вне / Escape). Строка всегда видна
  // (не скрывается при скролле).
  import Modal from './Modal.svelte';
  import QuickMenu from './QuickMenu.svelte';
  import TopicTabs from './TopicTabs.svelte';
  import FolderBar from './FolderBar.svelte';
  import { folderChain } from '../stores/folders.svelte';
  import { navigation } from '../stores/navigation.svelte';
  import { topicsStore } from '../stores/topics.svelte';
  import { ui } from '../stores/ui.svelte';

  let {
    open = $bindable(false),
  }: {
    open?: boolean;
  } = $props();

  const topicName = $derived(
    topicsStore.topics.find((t) => t.id === navigation.activeTopicID)?.name ?? '',
  );

  const context = $derived.by(() => {
    const parts = [topicName, ...folderChain().map((f) => f.name)].filter(Boolean);
    return parts.length > 0 ? parts.join(' › ') : '';
  });

  function close(): void {
    open = false;
  }

  // Долгое нажатие на строке — дропдаун «Создать топик» (тап по-прежнему
  // открывает шторку). Паттерн тот же, что в TopicTabs/FolderBar.
  const LONG_PRESS_MS = 500;
  let longPressTimer: number | undefined;
  let longPressFired = false;
  let quickMenu: { x: number; y: number } | null = $state(null);

  function handlePointerDown(event: PointerEvent): void {
    longPressFired = false;
    longPressTimer = window.setTimeout(() => {
      longPressFired = true;
      quickMenu = { x: event.clientX, y: event.clientY };
    }, LONG_PRESS_MS);
  }

  function cancelLongPress(): void {
    window.clearTimeout(longPressTimer);
  }

  function onTap(): void {
    if (longPressFired) {
      longPressFired = false;
      return;
    }
    open = true;
  }
</script>

<div class="overflow-hidden rounded-b-2xl bg-surface pt-[env(safe-area-inset-top)]">
  <button
    type="button"
    aria-haspopup="dialog"
    aria-expanded={open}
    class="flex h-11 w-full items-center gap-2 px-3 text-left transition-colors active:bg-border/30"
    onpointerdown={handlePointerDown}
    onpointerup={cancelLongPress}
    onpointercancel={cancelLongPress}
    onpointerleave={cancelLongPress}
    onclick={onTap}
  >
    <span class="shrink-0 text-base">📚</span>
    <span class="min-w-0 flex-1 truncate text-[15px] text-content">{context || 'Без топика'}</span>
    <span class="shrink-0 text-muted">▾</span>
  </button>
</div>

{#if open}
  <Modal open onClose={close}>
    <div class="flex flex-col">
      <TopicTabs />
      <FolderBar />
    </div>
  </Modal>
{/if}

{#if quickMenu !== null}
  <QuickMenu
    x={quickMenu.x}
    y={quickMenu.y}
    items={[
      {
        emoji: '📚',
        label: 'Создать топик',
        action: () => (ui.topicCreateOpen = true),
      },
    ]}
    onClose={() => (quickMenu = null)}
  />
{/if}
