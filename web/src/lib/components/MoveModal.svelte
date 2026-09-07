<script lang="ts">
  // Перемещение заметки в топик/папку (как «Перенос в другой топик» в боте):
  // выбор топика чипами, под ним — дерево папок выбранного топика. Папки
  // «чужих» топиков грузятся через getTopicFolders (кеш/запрос) и НЕ пишут
  // в foldersStore — список на экране под модалкой не меняется. Текущее
  // место заметки помечено «здесь» и недоступно; «Корень» — если заметка
  // не в корне выбранного топика.
  import Modal from './Modal.svelte';
  import Spinner from './Spinner.svelte';
  import { moveNote } from '../stores/notes.svelte';
  import { getTopicFolders, peekCachedFolders } from '../stores/folders.svelte';
  import { topicsStore } from '../stores/topics.svelte';
  import type { Folder, Note } from '../types/api';

  let {
    note,
    z,
    onClose,
  }: {
    note: Note;
    /** Слой поверх текущего экрана (см. Modal.z). */
    z?: string;
    onClose: () => void;
  } = $props();

  let busy = $state(false);
  let error = $state('');

  // Топик назначения: стартуем с топика заметки — папки показываются сразу
  // из кеша, переключаться на другие топики не нужно для «просто в папку».
  let selectedTopicId = $state(note.topic_id);
  let folders = $state<Folder[]>([]);
  let foldersLoading = $state(true);

  // Папки выбранного топика: кеш показываем сразу, свежесть догружаем
  // (getTopicFolders). При быстром переключении топиков ответ старого
  // запроса отменяется флагом (cancelled) — папки не «перескакивают».
  $effect(() => {
    const topicId = selectedTopicId;
    const cached = peekCachedFolders(topicId);
    folders = cached ?? [];
    foldersLoading = cached === undefined;
    error = '';
    let cancelled = false;
    void getTopicFolders(topicId)
      .then((fs) => {
        if (cancelled) return;
        folders = fs;
        foldersLoading = false;
      })
      .catch((e) => {
        if (cancelled) return;
        foldersLoading = false;
        error = e instanceof Error ? e.message : 'не удалось загрузить папки';
      });
    return () => {
      cancelled = true;
    };
  });

  /** Заметка сейчас в выбранном топике — для пометок «здесь». */
  const inSelectedTopic = $derived(selectedTopicId === note.topic_id);

  // Дерево папок выбранного топика плоским списком с глубиной: корневые
  // (depth 0) → подпапки (depth 1)…
  const tree = $derived.by(() => {
    const depth = new Map<number, number>();
    for (const f of folders) {
      if (f.parent_folder_id === null) depth.set(f.id, 0);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of folders) {
        if (depth.has(f.id)) continue;
        const parentDepth =
          f.parent_folder_id === null ? undefined : depth.get(f.parent_folder_id);
        if (parentDepth !== undefined) {
          depth.set(f.id, parentDepth + 1);
          changed = true;
        }
      }
    }
    return folders
      .map((f) => ({ folder: f, depth: depth.get(f.id) ?? 0 }))
      .sort((a, b) => a.depth - b.depth || a.folder.id - b.folder.id);
  });

  async function doMove(folderId: number | null): Promise<void> {
    busy = true;
    error = '';
    try {
      await moveNote(note, selectedTopicId, folderId);
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }
</script>

<Modal open {onClose} {z}>
  <div class="flex flex-col gap-2">
    <h2 class="px-2 pb-1 pt-1 text-lg font-semibold">Переместить</h2>
    {#if error}
      <p class="px-2 pb-1 text-sm text-danger">{error}</p>
    {/if}

    <!-- Топик назначения: чипы (стиль шторки «Топики»), выбранный подсвечен.
         Клик по уже выбранному — без действия (папки и так его). -->
    <div class="flex flex-wrap gap-1.5 px-1">
      {#each topicsStore.topics as topic (topic.id)}
        <button
          type="button"
          class="flex h-9 min-w-0 items-center gap-1.5 rounded-full px-3 text-sm transition-[background-color,transform] active:scale-[0.97] {topic.id ===
          selectedTopicId
            ? 'bg-accent-strong text-white'
            : 'bg-background text-content'}"
          disabled={busy}
          onclick={() => (selectedTopicId = topic.id)}
        >
          <span class="truncate">{topic.name}</span>
          {#if topic.id === selectedTopicId && topic.note_count > 0}
            <span class="shrink-0 text-xs opacity-60">{topic.note_count}</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if foldersLoading}
      <div class="flex h-20 items-center justify-center">
        <Spinner />
      </div>
    {:else}
      <!-- Корень выбранного топика -->
      {@const hereRoot = inSelectedTopic && note.folder_id === null}
      <button
        type="button"
        class="flex h-11 items-center rounded-xl px-2 text-base {hereRoot
          ? 'cursor-default text-muted'
          : 'active:bg-border/50'}"
        disabled={busy || hereRoot}
        onclick={() => doMove(null)}
      >
        <span class="w-7 shrink-0 text-center">📂</span> Корень
        {#if hereRoot}
          <span class="ml-auto text-sm text-muted">здесь</span>
        {/if}
      </button>

      {#each tree as { folder, depth } (folder.id)}
        {@const active = inSelectedTopic && note.folder_id === folder.id}
        <button
          type="button"
          class="flex h-11 items-center rounded-xl px-2 text-base {active
            ? 'cursor-default text-muted'
            : 'active:bg-border/50'}"
          style:padding-left={`${0.5 + depth * 1.25}rem`}
          disabled={busy || active}
          onclick={() => doMove(folder.id)}
        >
          <span class="w-7 shrink-0 text-center">📁</span>
          <span class="truncate">{folder.name}</span>
          {#if active}
            <span class="ml-auto text-sm text-muted">здесь</span>
          {/if}
        </button>
      {/each}
    {/if}

    <button
      type="button"
      class="mt-1 h-11 rounded-xl border border-border text-sm"
      onclick={onClose}
    >
      Отмена
    </button>
  </div>
</Modal>
