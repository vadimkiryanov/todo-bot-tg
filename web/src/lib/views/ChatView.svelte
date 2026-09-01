<script lang="ts">
  // Экран чата: строка контекста (топик/папка), список заметок, поле ввода снизу.
  // Архив и выход — в бургер-меню нижней панели (InputBar); топики и папки —
  // в шторке строки контекста (ContextStrip, всегда видна). Создание топика —
  // долгое нажатие на строке/топике или кнопка «Создать» на пустом экране;
  // создание папки — долгое нажатие на заметке или пустом месте.
  import { onDestroy } from 'svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ContextStrip from '$lib/components/ContextStrip.svelte';
  import CreateFolderModal from '$lib/components/CreateFolderModal.svelte';
  import CreateTopicModal from '$lib/components/CreateTopicModal.svelte';
  import InputBar from '$lib/components/InputBar.svelte';
  import NoteCard from '$lib/components/NoteCard.svelte';
  import NoteMenu from '$lib/components/NoteMenu.svelte';
  import NoteOverlay from '$lib/components/NoteOverlay.svelte';
  import QuickMenu from '$lib/components/QuickMenu.svelte';
  import { loadFolders } from '$lib/stores/folders.svelte';
  import { navigation } from '$lib/stores/navigation.svelte';
  import { clearNoteHighlight, loadNotes, notesStore } from '$lib/stores/notes.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { loadTopics, topicsStore } from '$lib/stores/topics.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import type { Note } from '$lib/types/api';

  // Актуальная заметка для оверлея — из store по id (после мутаций объект обновляется).
  let selectedId: number | null = $state(null);
  const selectedNote = $derived(
    selectedId === null
      ? null
      : notesStore.notes.find((n) => n.id === selectedId) ?? null,
  );

  // Дропдаун-меню (долгий тач по карточке): заметка + позиция карточки в момент открытия.
  let menuNoteId: number | null = $state(null);
  let menuRect: DOMRect | null = $state(null);
  const menuNote = $derived(
    menuNoteId === null ? null : notesStore.notes.find((n) => n.id === menuNoteId) ?? null,
  );

  function openMenu(note: Note, rect: DOMRect): void {
    menuNoteId = note.id;
    menuRect = rect;
  }

  function closeMenu(): void {
    menuNoteId = null;
    menuRect = null;
  }

  // Шторка контекста (топики/папки); открывается тапом по строке или
  // кнопкой 📚 нижней панели.
  let contextOpen = $state(false);

  // Долгое нажатие на пустом месте (заметок нет) — дропдаун «Создать папку».
  const LONG_PRESS_MS = 500;
  let emptyMenu: { x: number; y: number } | null = $state(null);
  let emptyPressTimer: number | undefined;

  function handleEmptyPress(event: PointerEvent): void {
    emptyPressTimer = window.setTimeout(() => {
      emptyMenu = { x: event.clientX, y: event.clientY };
    }, LONG_PRESS_MS);
  }

  function cancelEmptyPress(): void {
    window.clearTimeout(emptyPressTimer);
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

  // Подсветка «только что добавленной» заметки: держим ~3 сек и снимаем.
  const HIGHLIGHT_MS = 3000;
  let highlightTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const id = notesStore.highlightedId;
    if (id === null) return;
    if (highlightTimer !== null) clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
      highlightTimer = null;
      clearNoteHighlight();
    }, HIGHLIGHT_MS);
    return () => {
      if (highlightTimer !== null) {
        clearTimeout(highlightTimer);
        highlightTimer = null;
      }
    };
  });
  // Уход со экрана чата — подсветку не возобновляем при возврате.
  onDestroy(() => clearNoteHighlight());
</script>

<div class="flex h-full flex-col">
  <ContextStrip bind:open={contextOpen} />

  <main class="scroll-area flex-1 overflow-y-auto">
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
      <div class="flex flex-col items-center gap-4 px-6 py-16">
        <EmptyState emoji="＋" text="Создайте топик" />
        <button
          type="button"
          class="flex h-11 items-center gap-2 rounded-xl border border-border px-6 text-sm"
          onclick={() => (ui.topicCreateOpen = true)}
        >
          <span>＋</span> Создать
        </button>
      </div>
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
      <!-- Пустое место: долгое нажатие — дропдаун «Создать папку» -->
      <div
        role="group"
        aria-label="Пустое место"
        class="flex min-h-full flex-col"
        onpointerdown={handleEmptyPress}
        onpointerup={cancelEmptyPress}
        onpointercancel={cancelEmptyPress}
        onpointerleave={cancelEmptyPress}
      >
        <div class="flex flex-1 flex-col">
          <EmptyState />
        </div>
      </div>
    {:else}
      <div class="flex flex-col gap-2 px-3 py-3">
        {#each notesStore.notes as note, i (note.id)}
          <div class="note-enter" style="animation-delay: {Math.min(i * 24, 300)}ms">
            <NoteCard
              {note}
              highlighted={notesStore.highlightedId === note.id}
              onOpen={(n) => (selectedId = n.id)}
              onMenu={openMenu}
            />
          </div>
        {/each}
      </div>
    {/if}
  </main>

  <footer class="shrink-0 rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)]">
    <InputBar onOpenTopics={() => (contextOpen = true)} />
  </footer>
</div>

{#if selectedNote !== null}
  <NoteOverlay note={selectedNote} onClose={() => (selectedId = null)} />
{/if}

{#if menuNote !== null && menuRect !== null}
  <NoteMenu note={menuNote} rect={menuRect} onClose={closeMenu} />
{/if}

{#if emptyMenu !== null}
  <QuickMenu
    x={emptyMenu.x}
    y={emptyMenu.y}
    items={[
      {
        emoji: '📁',
        label: 'Создать папку',
        action: () => (ui.folderCreateOpen = true),
      },
    ]}
    onClose={() => (emptyMenu = null)}
  />
{/if}

<CreateTopicModal />
<CreateFolderModal />
