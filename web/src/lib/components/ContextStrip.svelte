<script lang="ts">
  // Компактная строка контекста: «📚 Топик › 📁 Папка › Подпапка».
  // Тап — шторка снизу с полными списками (TopicTabs + FolderBar).
  // Шторка не закрывается автоматически при выборе — только вручную
  // (тап вне / Escape). Строка всегда видна (не скрывается при скролле).
  import Modal from './Modal.svelte';
  import TopicTabs from './TopicTabs.svelte';
  import FolderBar from './FolderBar.svelte';
  import { folderChain } from '../stores/folders.svelte';
  import { navigation } from '../stores/navigation.svelte';
  import { topicsStore } from '../stores/topics.svelte';

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
</script>

<div class="overflow-hidden rounded-b-2xl bg-surface pt-[env(safe-area-inset-top)]">
  <button
    type="button"
    aria-haspopup="dialog"
    aria-expanded={open}
    class="flex h-11 w-full items-center gap-2 px-3 text-left transition-colors active:bg-border/30"
    onclick={() => (open = true)}
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
