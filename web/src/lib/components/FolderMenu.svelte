<script lang="ts">
  // Контекстное меню строки папки в списке заметок (режим «в списке»):
  // дропдаун у карточки, как у заметок (NoteMenu) — тот же набор действий,
  // что в меню папки в дереве: переименовать/удалить. Переименование — форма
  // в шторке (Modal), удаление — с подтверждением (ConfirmModal).
  import { onMount } from 'svelte';
  import ConfirmModal from './ConfirmModal.svelte';
  import Modal from './Modal.svelte';
  import { deleteFolder, renameFolder } from '../stores/folders.svelte';
  import type { Folder } from '../types/api';
  import { lockScroll, unlockScroll } from '../utils/scroll';

  let {
    folder,
    rect,
    onClose,
  }: {
    folder: Folder;
    rect: DOMRect;
    onClose: () => void;
  } = $props();

  let mode = $state<'menu' | 'rename'>('menu');
  // Черновик названия: заполняется при открытии формы переименования.
  let renameName = $state('');
  let busy = $state(false);
  let error = $state('');
  let confirmDelete = $state(false);

  // Позиция: под карточкой; если меню выше доступного места снизу — над ней.
  let menuEl: HTMLDivElement | undefined = $state();
  let openUp = $state(false);
  const pos = $derived.by(() => {
    const width = Math.min(Math.max(rect.width, 240), 336);
    return {
      width,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: rect.bottom + 6,
      bottom: Math.max(8, window.innerHeight - rect.top + 6),
    };
  });

  $effect(() => {
    if (menuEl) {
      const below = window.innerHeight - rect.bottom - 6;
      openUp = menuEl.offsetHeight > below;
    }
  });

  onMount(() => {
    // Пока меню открыто — скролл списка заморожен (как у меню заметки):
    // жест скролла не должен прятать меню.
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

  function openRename(): void {
    renameName = folder.name;
    error = '';
    mode = 'rename';
  }

  async function submitRename(): Promise<void> {
    const name = renameName.trim();
    if (name === '') {
      error = 'введите название';
      return;
    }
    busy = true;
    error = '';
    try {
      await renameFolder(folder.id, name);
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  async function doDelete(): Promise<void> {
    busy = true;
    error = '';
    try {
      await deleteFolder(folder.id);
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }
</script>

{#if confirmDelete}
  <ConfirmModal
    title="Удалить папку?"
    text="Вместе с папкой удалятся все вложенные папки и заметки"
    {busy}
    {error}
    onClose={() => {
      confirmDelete = false;
      error = '';
    }}
    onConfirm={() => void doDelete()}
  />
{:else if mode === 'rename'}
  <Modal open onClose={onClose}>
    <form
      class="flex flex-col gap-3"
      onsubmit={(e) => {
        e.preventDefault();
        void submitRename();
      }}
    >
      <h2 class="text-lg font-semibold">Переименовать</h2>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        bind:value={renameName}
        maxlength="64"
        class="h-11 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent"
        autofocus
      />
      {#if error}
        <p class="text-sm text-danger">{error}</p>
      {/if}
      <div class="flex gap-2">
        <button
          type="button"
          class="h-11 flex-1 rounded-xl border border-border text-sm"
          onclick={() => {
            mode = 'menu';
            error = '';
          }}
        >
          Назад
        </button>
        <button
          type="submit"
          class="h-11 flex-1 rounded-xl bg-accent-strong text-sm font-medium text-white disabled:opacity-50"
          disabled={busy}
        >
          Сохранить
        </button>
      </div>
    </form>
  </Modal>
{:else}
  <!-- Затемнённый фон: тап по нему — закрыть меню -->
  <div class="backdrop-anim fixed inset-0 z-40 bg-black/40" onclick={onClose} aria-hidden="true"></div>

  <div
    bind:this={menuEl}
    class="glass-menu menu-anim fixed z-50 flex flex-col gap-1 rounded-2xl p-2 shadow-xl"
    style:left={`${pos.left}px`}
    style:width={`${pos.width}px`}
    style:top={openUp ? undefined : `${pos.top}px`}
    style:bottom={openUp ? `${pos.bottom}px` : undefined}
    role="menu"
  >
    {#if error}
      <p class="px-3 py-1 text-xs text-danger">{error}</p>
    {/if}
    <button
      type="button"
      role="menuitem"
      class="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left transition-colors active:bg-border/50"
      onclick={openRename}
    >
      <span class="w-6 shrink-0 text-center text-base">✏️</span>
      Переименовать
    </button>
    <button
      type="button"
      role="menuitem"
      class="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left text-danger transition-colors active:bg-border/50"
      onclick={() => {
        error = '';
        confirmDelete = true;
      }}
    >
      <span class="w-6 shrink-0 text-center text-base">🗑</span>
      Удалить
    </button>
  </div>
{/if}
