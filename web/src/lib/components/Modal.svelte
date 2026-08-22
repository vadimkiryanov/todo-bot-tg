<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(false),
    onClose,
    children,
  }: {
    open?: boolean;
    onClose?: () => void;
    children?: Snippet;
  } = $props();

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose?.();
    }
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    onclick={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}
    onkeydown={onKeydown}
    role="presentation"
  >
    <div
      class="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-xl sm:rounded-2xl"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
    >
      {@render children?.()}
    </div>
  </div>
{/if}
