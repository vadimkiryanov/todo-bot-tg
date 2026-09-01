<script lang="ts">
  // Модалка создания папки: открывается из дропдаунов долгого нажатия
  // (заметка / пустое место) — флаг в ui-сторе, форма одна. Папка создаётся
  // на текущем уровне (в активной папке или в корне топика).
  import Modal from './Modal.svelte';
  import { ui } from '../stores/ui.svelte';
  import { createFolder } from '../stores/folders.svelte';

  let name = $state('');
  let error = $state('');
  let busy = $state(false);

  // Автофокус в инпут при открытии формы (autofocus-атрибут в Safari/повторном
  // открытии не срабатывает). Подъём шторки над клавиатурой — в Modal.
  let input = $state<HTMLInputElement | undefined>();
  $effect(() => {
    if (!ui.folderCreateOpen) return;
    input?.focus();
  });

  function close(): void {
    ui.folderCreateOpen = false;
    name = '';
    error = '';
  }

  async function submit(): Promise<void> {
    const value = name.trim();
    if (value === '') {
      error = 'введите название';
      return;
    }
    busy = true;
    error = '';
    try {
      await createFolder(value);
      close();
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }
</script>

{#if ui.folderCreateOpen}
  <Modal open onClose={close}>
    <form
      class="flex flex-col gap-3"
      onsubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 class="text-lg font-semibold">Новая папка</h2>
      <input
        type="text"
        bind:this={input}
        bind:value={name}
        placeholder="Название"
        maxlength="64"
        class="h-11 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent"
      />
      {#if error}
        <p class="text-sm text-danger">{error}</p>
      {/if}
      <div class="flex gap-2">
        <button
          type="button"
          class="h-11 flex-1 rounded-xl border border-border text-sm"
          onclick={close}
        >
          Отмена
        </button>
        <button
          type="submit"
          class="h-11 flex-1 rounded-xl bg-accent-strong text-sm font-medium text-white disabled:opacity-50"
          disabled={busy}
        >
          Создать
        </button>
      </div>
    </form>
  </Modal>
{/if}
