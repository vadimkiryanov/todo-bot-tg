<script lang="ts">
  // Экран чата: табы топиков сверху, папки под ними, список заметок, поле ввода снизу.
  // Выход из аккаунта — кнопка 🚪 в шапке; архив — кнопка 🗄 (URL /archive).
  import { goto } from '$app/navigation';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import FolderBar from '$lib/components/FolderBar.svelte';
  import InputBar from '$lib/components/InputBar.svelte';
  import NoteCard from '$lib/components/NoteCard.svelte';
  import NoteOverlay from '$lib/components/NoteOverlay.svelte';
  import TopicTabs from '$lib/components/TopicTabs.svelte';
  import { loadFolders } from '$lib/stores/folders.svelte';
  import { navigation } from '$lib/stores/navigation.svelte';
  import { loadArchived, loadNotes, notesStore } from '$lib/stores/notes.svelte';
  import { logout, session } from '$lib/stores/session.svelte';
  import { loadTopics, topicsStore } from '$lib/stores/topics.svelte';

  // Актуальная заметка для оверлея — из store по id (после мутаций объект обновляется).
  let selectedId: number | null = $state(null);
  const selectedNote = $derived(
    selectedId === null
      ? null
      : notesStore.notes.find((n) => n.id === selectedId) ?? null,
  );

  async function doLogout(): Promise<void> {
    await logout();
    await goto('/login');
  }

  async function goArchived(): Promise<void> {
    // Сразу грузим архив — экран покажет данные без повторного запроса.
    await loadArchived();
    await goto('/archive');
  }

  // При авторизации (старт или вход) — загружаем топики.
  $effect(() => {
    if (session.state === 'authed') {
      void loadTopics();
    }
  });

  // При выборе топика — загружаем его папки (полный список для дерева).
  $effect(() => {
    const topicId = navigation.activeTopicID;
    if (topicId === null) return;
    void loadFolders(topicId);
  });

  // При смене топика или папки — загружаем заметки уровня.
  $effect(() => {
    const topicId = navigation.activeTopicID;
    if (topicId === null) return;
    void loadNotes(topicId, navigation.activeFolderID);
  });
</script>

<div class="flex h-full flex-col">
  <header
    class="flex shrink-0 items-center justify-center border-b border-border bg-surface pt-[env(safe-area-inset-top)]"
  >
    <div class="relative flex h-[52px] w-full items-center justify-center">
      <span class="text-xl">📝</span>
      <button
        type="button"
        aria-label="Выйти"
        class="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full text-lg active:bg-border/50"
        onclick={() => void doLogout()}
      >
        🚪
      </button>
      <button
        type="button"
        aria-label="Архив"
        class="absolute right-3 flex h-10 w-10 items-center justify-center rounded-full text-lg active:bg-border/50"
        onclick={() => void goArchived()}
      >
        🗄
      </button>
    </div>
  </header>

  <TopicTabs />
  <FolderBar />

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
            const topicId = navigation.activeTopicID;
            if (topicId !== null) void loadNotes(topicId, navigation.activeFolderID);
          }}
        >
          Повторить
        </button>
      </div>
    {:else if notesStore.notes.length === 0}
      <EmptyState />
    {:else}
      <div class="flex flex-col gap-2 px-3 py-3">
        {#each notesStore.notes as note, i (note.id)}
          <div class="note-enter" style="animation-delay: {Math.min(i * 24, 300)}ms">
            <NoteCard {note} onOpen={(n) => (selectedId = n.id)} />
          </div>
        {/each}
      </div>
    {/if}
  </main>

  <footer class="shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
    <InputBar />
  </footer>
</div>

{#if selectedNote !== null}
  <NoteOverlay note={selectedNote} onClose={() => (selectedId = null)} />
{/if}
