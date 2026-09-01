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

  // Закрытие с анимацией: вешаем обратные классы (.backdrop-out/.sheet-out),
  // даём анимации доиграть и только потом зовём onClose — родитель
  // размонтирует шторку уже невидимой.
  let closing = $state(false);
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  function requestClose(): void {
    if (closing) return;
    closing = true;
    closeTimer = setTimeout(() => {
      closing = false;
      onClose?.();
    }, 180);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      requestClose();
    }
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center {closing ? 'backdrop-out' : 'backdrop-anim'}"
    onclick={(event) => {
      if (event.target === event.currentTarget) requestClose();
    }}
    onkeydown={onKeydown}
    role="presentation"
  >
    <div
      class="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-xl sm:rounded-2xl {closing ? 'sheet-out' : 'sheet-anim'}"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
    >
      {@render children?.()}
    </div>
  </div>
{/if}
