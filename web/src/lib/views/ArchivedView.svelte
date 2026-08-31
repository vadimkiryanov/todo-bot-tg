<script lang="ts">
  // Экран архива (URL /archive): заметки из всех топиков. Действия — вернуть / удалить.
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import NoteCard from '$lib/components/NoteCard.svelte';
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

  <main class="flex-1 overflow-y-auto">
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
          <NoteCard {note} onOpen={(n) => (selectedId = n.id)} />
        {/each}
      </div>
    {/if}
  </main>
</div>

{#if selectedNote !== null}
  <Modal open onClose={() => (selectedId = null)}>
    {#if confirmDelete}
      <div class="flex flex-col gap-4 px-1 py-2">
        <h2 class="text-lg font-semibold">Удалить заметку?</h2>
        {#if error}
          <p class="text-sm text-danger">{error}</p>
        {/if}
        <div class="flex gap-2">
          <button
            type="button"
            class="h-11 flex-1 rounded-xl border border-border text-sm"
            onclick={() => {
              confirmDelete = false;
              error = '';
            }}
          >
            Отмена
          </button>
          <button
            type="button"
            class="h-11 flex-1 rounded-xl bg-danger text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
            onclick={() => doDelete(selectedNote)}
          >
            Удалить
          </button>
        </div>
      </div>
    {:else}
      <div class="flex flex-col gap-4 px-1 py-2">
        <div
          class="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-[15px] leading-6 [&_a]:text-accent [&_a]:underline [&_code]:rounded [&_code]:bg-border/40 [&_code]:px-1 {selectedNote
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
            class="flex h-11 w-11 items-center justify-center rounded-full bg-background text-lg"
            disabled={busy}
            onclick={() => doUnarchive(selectedNote)}
          >
            ↩️
          </button>
          <button
            type="button"
            aria-label="Удалить"
            class="flex h-11 w-11 items-center justify-center rounded-full bg-background text-lg"
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
