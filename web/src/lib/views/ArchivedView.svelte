<script lang="ts">
  // Экран архива (URL /archive): заметки из всех топиков. Действия — вернуть / удалить.
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ConfirmModal from '$lib/components/ConfirmModal.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import NoteCard from '$lib/components/NoteCard.svelte';
  import NoteEditForm from '$lib/components/NoteEditForm.svelte';
  import NoteMenu from '$lib/components/NoteMenu.svelte';
  import {
    archivedStore,
    loadArchived,
    removeArchivedNote,
    unarchiveNote,
  } from '$lib/stores/notes.svelte';
  import { logout } from '$lib/stores/session.svelte';
  import type { Note } from '$lib/types/api';
  import { renderNoteHtml } from '$lib/utils/format';

  let selectedId: number | null = $state(null);
  const selectedNote = $derived(
    selectedId === null
      ? null
      : archivedStore.notes.find((n) => n.id === selectedId) ?? null,
  );

  // Дропдаун-меню (долгий тач по карточке): заметка + позиция карточки в момент открытия.
  let menuNoteId: number | null = $state(null);
  let menuRect: DOMRect | null = $state(null);
  const menuNote = $derived(
    menuNoteId === null ? null : archivedStore.notes.find((n) => n.id === menuNoteId) ?? null,
  );

  function openMenu(note: Note, rect: DOMRect): void {
    menuNoteId = note.id;
    menuRect = rect;
  }

  function closeMenu(): void {
    menuNoteId = null;
    menuRect = null;
  }

  // Редактирование из контекстного меню («✏️ Редактировать»): оверлей сразу
  // в режиме редактирования.
  let editing = $state(false);

  function requestEdit(note: Note): void {
    selectedId = note.id;
    editing = true;
  }

  function closeOverlay(): void {
    selectedId = null;
    editing = false;
  }

  let busy = $state(false);
  let error = $state('');
  let confirmDelete = $state(false);

  onMount(() => {
    void loadArchived();
  });

  async function doLogout(): Promise<void> {
    await logout();
    await goto('/login');
  }

  async function doUnarchive(note: Note): Promise<void> {
    busy = true;
    error = '';
    try {
      await unarchiveNote(note);
      selectedId = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  async function doDelete(note: Note): Promise<void> {
    busy = true;
    error = '';
    try {
      await removeArchivedNote(note);
      selectedId = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex h-full flex-col">
  <header
    class="flex shrink-0 items-center justify-between border-b border-border bg-surface px-3 pt-[env(safe-area-inset-top)]"
  >
    <button
      type="button"
      aria-label="Назад"
      class="flex h-10 w-10 items-center justify-center rounded-full text-lg active:bg-border/50"
      onclick={() => void goto('/')}
    >
      ←
    </button>
    <span class="text-xl">🗄</span>
    <button
      type="button"
      aria-label="Выйти"
      class="flex h-10 w-10 items-center justify-center rounded-full text-lg active:bg-border/50"
      onclick={() => void doLogout()}
    >
      🚪
    </button>
  </header>

  <main class="scroll-area flex-1 overflow-y-auto">
    {#if archivedStore.loading}
      <EmptyState emoji="⏳" />
    {:else if archivedStore.error}
      <div class="flex flex-col items-center gap-4 px-6 py-16">
        <EmptyState emoji="⚠️" text={archivedStore.error} />
        <button
          type="button"
          class="h-11 rounded-xl border border-border px-6 text-sm"
          onclick={() => void loadArchived()}
        >
          Повторить
        </button>
      </div>
    {:else if archivedStore.notes.length === 0}
      <EmptyState emoji="🗄" text="Архив пуст" />
    {:else}
      <div class="flex flex-col gap-2 px-3 py-3">
        {#each archivedStore.notes as note (note.id)}
          <NoteCard {note} onOpen={(n) => (selectedId = n.id)} onMenu={openMenu} />
        {/each}
      </div>
    {/if}
  </main>
</div>

{#if selectedNote !== null}
  <Modal open onClose={closeOverlay}>
    {#if editing}
      <h2 class="mb-3 text-lg font-semibold">✏️ Редактировать</h2>
      <NoteEditForm
        note={selectedNote}
        onCancel={() => (editing = false)}
        onSaved={() => {
          editing = false;
          closeOverlay();
        }}
      />
    {:else}
      <div class="flex flex-col gap-4 px-1 py-2">
        <div
          class="whitespace-pre-wrap break-words text-[15px] leading-6 [&_a]:text-accent [&_a]:underline [&_code]:rounded [&_code]:bg-border/40 [&_code]:px-1 {selectedNote
            .done
            ? 'text-muted line-through'
            : 'text-content'}"
        >
          {@html renderNoteHtml(selectedNote.text, selectedNote.entities)}
        </div>
        {#if error}
          <p class="text-sm text-danger">{error}</p>
        {/if}
        <div class="flex items-center justify-between gap-1">
          <button
            type="button"
            aria-label="Вернуть из архива"
            class="flex h-11 w-11 items-center justify-center rounded-full bg-background text-lg transition-transform active:scale-90"
            disabled={busy}
            onclick={() => doUnarchive(selectedNote)}
          >
            ↩️
          </button>
          <button
            type="button"
            aria-label="Удалить"
            class="flex h-11 w-11 items-center justify-center rounded-full bg-background text-lg transition-transform active:scale-90"
            disabled={busy}
            onclick={() => {
              confirmDelete = true;
              error = '';
            }}
          >
            🗑
          </button>
        </div>
      </div>
    {/if}
  </Modal>
{/if}

{#if selectedNote !== null && confirmDelete}
  <ConfirmModal
    title="Удалить заметку?"
    text="Заметка будет удалена безвозвратно"
    {busy}
    {error}
    onClose={() => {
      confirmDelete = false;
      error = '';
    }}
    onConfirm={() => doDelete(selectedNote)}
  />
{/if}

{#if menuNote !== null && menuRect !== null}
  <NoteMenu
    note={menuNote}
    rect={menuRect}
    archived
    onClose={closeMenu}
    onEdit={requestEdit}
  />
{/if}
