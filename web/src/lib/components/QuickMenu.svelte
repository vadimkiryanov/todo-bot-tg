<script lang="ts">
  // Компактный дропдаун-меню действий: позиционируется fixed около точки
  // долгого нажатия; если снизу мало места — над ней. Закрывается по тапу
  // вне или Escape; пока меню открыто, скролл списка заморожен (уход пальца
  // или скролл-жест не закрывают меню).
  import { onMount } from 'svelte';
  import { lockScroll, unlockScroll } from '../utils/scroll';

  export interface QuickMenuItem {
    emoji?: string;
    label: string;
    danger?: boolean;
    action: () => void;
  }

  let {
    x,
    y,
    items,
    onClose,
  }: {
    x: number;
    y: number;
    items: QuickMenuItem[];
    onClose: () => void;
  } = $props();

  const WIDTH = 224; // w-56
  const MARGIN = 8;

  let menuEl: HTMLDivElement | undefined = $state();
  let openUp = $state(false);

  const left = $derived(Math.max(MARGIN, Math.min(x, window.innerWidth - WIDTH - MARGIN)));

  $effect(() => {
    if (!menuEl) return;
    const below = window.innerHeight - y - MARGIN;
    openUp = menuEl.offsetHeight > below;
  });

  onMount(() => {
    lockScroll();
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeydown);
    return () => {
      unlockScroll();
      window.removeEventListener('keydown', onKeydown);
    };
  });

  function pick(item: QuickMenuItem): void {
    onClose();
    item.action();
  }
</script>

<div
  class="backdrop-anim pointer-events-auto fixed inset-0 z-40 bg-black/40"
  onclick={onClose}
  aria-hidden="true"
></div>

<div
  bind:this={menuEl}
  class="menu-anim pointer-events-auto fixed z-50 flex w-56 flex-col gap-1 rounded-2xl border border-border bg-surface p-2 shadow-xl"
  style:left={`${left}px`}
  style:top={openUp ? undefined : `${y + MARGIN}px`}
  style:bottom={openUp ? `${Math.max(MARGIN, window.innerHeight - y + MARGIN)}px` : undefined}
  role="menu"
>
  {#each items as item (item.label)}
    <button
      type="button"
      role="menuitem"
      class="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left transition-colors active:bg-border/50 {item.danger
        ? 'text-danger'
        : ''}"
      onclick={() => pick(item)}
    >
      {#if item.emoji}
        <span class="w-6 shrink-0 text-center text-base">{item.emoji}</span>
      {/if}
      <span class="truncate">{item.label}</span>
    </button>
  {/each}
</div>
