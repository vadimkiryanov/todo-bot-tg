<script lang="ts">
  // Экран чата: табы топиков сверху, список заметок, поле ввода снизу.
  // Долгий тап по шапке — меню пользователя (выход).
  import EmptyState from '../lib/components/EmptyState.svelte';
  import InputBar from '../lib/components/InputBar.svelte';
  import Modal from '../lib/components/Modal.svelte';
  import NoteCard from '../lib/components/NoteCard.svelte';
  import NoteOverlay from '../lib/components/NoteOverlay.svelte';
  import TopicTabs from '../lib/components/TopicTabs.svelte';
  import { navigation, showLogin } from '../lib/stores/navigation.svelte';
  import { loadNotes, notesStore } from '../lib/stores/notes.svelte';
  import { logout } from '../lib/stores/session.svelte';
  import { loadTopics, topicsStore } from '../lib/stores/topics.svelte';

  // Актуальная заметка для оверлея — из store по id (после мутаций объект обновляется).
  let selectedId: number | null = $state(null);
  const selectedNote = $derived(
    selectedId === null
      ? null
      : notesStore.notes.find((n) => n.id === selectedId) ?? null,
  );

  // Меню пользователя (долгий тап по шапке).
  let showMenu = $state(false);
  let longPressTimer: number | undefined;

  const LONG_PRESS_MS = 500;

  function headerPointerDown(): void {
    longPressTimer = window.setTimeout(() => {
      showMenu = true;
    }, LONG_PRESS_MS);
  }

  function cancelLongPress(): void {
    window.clearTimeout(longPressTimer);
  }

  function headerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      showMenu = true;
    }
  }

  async function doLogout(): Promise<void> {
    showMenu = false;
    await logout();
    showLogin();
  }

  // При выборе топика — загружаем его заметки.
  $effect(() => {
    const topicId = navigation.activeTopicID;
    if (topicId !== null) {
      void loadNotes(topicId);
    }
  });
</script>

<div class="flex h-full flex-col">
  <header
    class="flex shrink-0 items-center justify-center border-b border-border bg-surface pt-[env(safe-area-inset-top)]"
    role="button"
    tabindex="0"
    aria-label="Меню"
    onpointerdown={headerPointerDown}
    onpointerup={cancelLongPress}
    onpointerleave={cancelLongPress}
    onkeydown={headerKeydown}
  >
    <div class="flex h-[52px] items-center gap-2">
      <span class="text-xl">📝</span>
    </div>
  </header>

  <TopicTabs />

  <main class="flex-1 overflow-y-auto">
    {#if topicsStore.loading}
      <EmptyState emoji="⏳" />
    {:else if topicsStore.error}
      <div class="flex flex-col items-center gap-4 px-6 py-16">
        <EmptyState emoji="⚠️" text={topicsStore.error} />
        <button
          type="button"
          class="h-11 rounded-xl border border-border px-6 text-sm"
          onclick={() => void loadTopics()}
        >
          Повторить
        </button>
      </div>
    {:else if topicsStore.topics.length === 0}
      <EmptyState emoji="＋" text="Создайте топик" />
    {:else if notesStore.loading}
      <EmptyState emoji="⏳" />
    {:else if notesStore.error}
      <div class="flex flex-col items-center gap-4 px-6 py-16">
        <EmptyState emoji="⚠️" text={notesStore.error} />
        <button
          type="button"
          class="h-11 rounded-xl border border-border px-6 text-sm"
          onclick={() => {
            if (navigation.activeTopicID !== null) void loadNotes(navigation.activeTopicID);
          }}
        >
          Повторить
        </button>
      </div>
    {:else if notesStore.notes.length === 0}
      <EmptyState />
    {:else}
      <div class="flex flex-col gap-2 px-3 py-3">
        {#each notesStore.notes as note (note.id)}
          <NoteCard {note} onOpen={(n) => (selectedId = n.id)} />
        {/each}
      </div>
    {/if}
  </main>

  <footer class="shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
    <InputBar />
  </footer>
</div>

{#if showMenu}
  <Modal open onClose={() => (showMenu = false)}>
    <div class="flex flex-col gap-1 px-1 py-2">
      <button
        type="button"
        class="flex h-12 items-center gap-3 rounded-xl px-2 text-base"
        onclick={doLogout}
      >
        <span>🚪</span> Выйти
      </button>
      <button
        type="button"
        class="mt-2 h-11 rounded-xl border border-border text-sm"
        onclick={() => (showMenu = false)}
      >
        Отмена
      </button>
    </div>
  </Modal>
{/if}

{#if selectedNote !== null}
  <NoteOverlay note={selectedNote} onClose={() => (selectedId = null)} />
{/if}
