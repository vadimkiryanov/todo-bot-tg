<script lang="ts">
  // Экран архива (URL /archive): заметки из всех топиков.
  // Открытие заметки — полноэкранная «страница» (NotePage): вернуть из архива /
  // удалить. Возврат на главный экран — стрелка в шапке.
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import NoteCard from '$lib/components/NoteCard.svelte';
  import NoteMenu from '$lib/components/NoteMenu.svelte';
  import NotePage from '$lib/components/NotePage.svelte';
  import { archivedStore, loadArchived } from '$lib/stores/notes.svelte';
  import { logout } from '$lib/stores/session.svelte';
  import type { Note } from '$lib/types/api';

  // Открытая заметка: кэш объекта — заметка может исчезнуть из списка
  // (вернуть из архива/удалить) раньше, чем доиграет закрытие страницы.
  let selectedId: number | null = $state(null);
  let selectedCache: Note | null = $state(null);
  $effect(() => {
    if (selectedId === null) {
      selectedCache = null;
      return;
    }
    const found = archivedStore.notes.find((n) => n.id === selectedId);
    if (found) selectedCache = found;
  });

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

  // Редактирование из контекстного меню («✏️ Редактировать»): страница сразу
  // в режиме редактирования.
  let editRequestId: number | null = $state(null);

  function requestEdit(note: Note): void {
    editRequestId = note.id;
    selectedId = note.id;
  }

  function closePage(): void {
    selectedId = null;
    editRequestId = null;
  }

  onMount(() => {
    void loadArchived();
  });

  async function doLogout(): Promise<void> {
    await logout();
    await goto('/login');
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

{#if selectedCache !== null}
  <NotePage
    note={selectedCache}
    startEditing={editRequestId === selectedCache.id}
    onClose={closePage}
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
