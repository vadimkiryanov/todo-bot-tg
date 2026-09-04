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

  // Мобильная клавиатура перекрывает низ экрана (iOS не сжимает вьюпорт,
  // в отличие от Android): следим за visualViewport и поднимаем шторку
  // над клавиатурой — отступ снизу + ограничение высоты. Без этого инпуты
  // (создание/переименование, напоминание) оказываются под клавиатурой,
  // а scrollIntoView не спасает: шторка слишком короткая, скроллить нечего.
  let keyboardInset = $state(0);
  let visualHeight = $state(0);

  $effect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = (): void => {
      // На Android высота вьюпорта уже сжимается клавиатурой — разница ≈ 0.
      keyboardInset = Math.max(0, window.innerHeight - vv.height);
      visualHeight = vv.height;
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  });

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
    class="backdrop-glass fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center {closing ? 'backdrop-out' : 'backdrop-anim'}"
    style="padding-bottom: {keyboardInset}px"
    onclick={(event) => {
      if (event.target === event.currentTarget) requestClose();
    }}
    onkeydown={onKeydown}
    role="presentation"
  >
    <div
      class="glass-sheet max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl p-4 shadow-xl sm:rounded-2xl {closing ? 'sheet-out' : 'sheet-anim'}"
      style={keyboardInset > 0 ? `max-height: ${visualHeight}px` : undefined}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
    >
      {@render children?.()}
    </div>
  </div>
{/if}
