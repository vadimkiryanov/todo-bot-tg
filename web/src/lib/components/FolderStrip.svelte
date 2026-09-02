<script lang="ts">
  // Строка текущей папки под островком топиков: «📁 Папка › Подпапка» (или
  // «Корень»). Тап — шторка папок (дерево активного топика); долгий тап —
  // дропдаун «Создать папку» (на текущем уровне) / «Создать топик».
  import QuickMenu from './QuickMenu.svelte';
  import { folderChain } from '../stores/folders.svelte';
  import { navigation } from '../stores/navigation.svelte';
  import { topicsStore } from '../stores/topics.svelte';
  import { ui } from '../stores/ui.svelte';
  import { suppressNextClick } from '../utils/click';

  let {
    /** Открыть шторку папок. */
    onOpen,
  }: { onOpen: () => void } = $props();

  const chain = $derived(folderChain().map((f) => f.name));

  // Долгий тап на строке — дропдаун создания.
  const LONG_PRESS_MS = 500;
  let longPressTimer: number | undefined;
  let longPressFired = false;
  let quickMenu: { x: number; y: number } | null = $state(null);

  function clearTimer(): void {
    window.clearTimeout(longPressTimer);
  }

  function handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    longPressFired = false;
    clearTimer();
    longPressTimer = window.setTimeout(() => {
      longPressFired = true;
      suppressNextClick();
      quickMenu = { x: e.clientX, y: e.clientY };
    }, LONG_PRESS_MS);
  }

  function onTap(): void {
    if (longPressFired) {
      longPressFired = false;
      return;
    }
    onOpen();
  }
</script>

{#if topicsStore.topics.length > 0}
  <button
    type="button"
    class="strip-glass pointer-events-auto mx-auto flex h-9 w-full max-w-md select-none items-center gap-2 rounded-xl px-3 text-left text-[13px] text-muted transition-colors active:bg-black/5 dark:active:bg-white/10"
    onpointerdown={handlePointerDown}
    onpointerup={clearTimer}
    onpointercancel={clearTimer}
    onpointerleave={clearTimer}
    onclick={onTap}
  >
    <span class="shrink-0 text-sm leading-none">📁</span>
    <span class="min-w-0 flex-1 truncate">
      {#if navigation.activeFolderID === null}
        Корень
      {:else if chain.length > 0}
        {chain.join(' › ')}
      {:else}
        Корень
      {/if}
    </span>
    <span class="shrink-0 text-xs">▾</span>
  </button>
{/if}

{#if quickMenu !== null}
  <QuickMenu
    x={quickMenu.x}
    y={quickMenu.y}
    items={[
      {
        emoji: '📁',
        label: 'Создать папку',
        action: () => (ui.folderCreateOpen = true),
      },
      {
        emoji: '📚',
        label: 'Создать топик',
        action: () => (ui.topicCreateOpen = true),
      },
    ]}
    onClose={() => (quickMenu = null)}
  />
{/if}

<style>
  button {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
</style>
