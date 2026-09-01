<script lang="ts">
  // Подтверждение необратимого действия (удаление): заголовок, описание,
  // кнопки «Отмена» / опасное действие. Открывается поверх текущего экрана.
  import Modal from './Modal.svelte';

  let {
    title,
    text,
    confirmText = 'Удалить',
    busy = false,
    error = '',
    onClose,
    onConfirm,
  }: {
    title: string;
    text?: string;
    confirmText?: string;
    busy?: boolean;
    error?: string;
    onClose: () => void;
    onConfirm: () => void;
  } = $props();
</script>

<Modal open {onClose}>
  <div class="flex flex-col gap-4 px-1 py-2">
    <div>
      <h2 class="text-lg font-semibold">{title}</h2>
      {#if text}
        <p class="mt-1 text-sm text-muted">{text}</p>
      {/if}
    </div>
    {#if error}
      <p class="text-sm text-danger">{error}</p>
    {/if}
    <div class="flex gap-2">
      <button
        type="button"
        class="h-11 flex-1 rounded-xl border border-border text-sm disabled:opacity-50"
        disabled={busy}
        onclick={onClose}
      >
        Отмена
      </button>
      <button
        type="button"
        class="h-11 flex-1 rounded-xl bg-danger text-sm font-medium text-white disabled:opacity-50"
        disabled={busy}
        onclick={onConfirm}
      >
        {confirmText}
      </button>
    </div>
  </div>
</Modal>
