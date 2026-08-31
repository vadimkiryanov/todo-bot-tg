<script lang="ts">
  // Перемещение заметки в папку активного топика: дерево папок с отступами.
  // Текущая папка помечена и неактивна; «Корень» доступен, если заметка не в корне.
  import Modal from './Modal.svelte';
  import { moveNote } from '../stores/notes.svelte';
  import { foldersStore } from '../stores/folders.svelte';
  import type { Folder, Note } from '../types/api';

  let { note, onClose }: { note: Note; onClose: () => void } = $props();

  let busy = $state(false);
  let error = $state('');

  // Дерево папок плоским списком с глубиной: корневые (depth 0) → подпапки (depth 1)…
  const tree = $derived.by(() => {
    const depth = new Map<number, number>();
    const rootIds: number[] = [];
    for (const f of foldersStore.all) {
      if (f.parent_folder_id === null) {
        depth.set(f.id, 0);
        rootIds.push(f.id);
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of foldersStore.all) {
        if (depth.has(f.id)) continue;
        const parentDepth =
          f.parent_folder_id === null ? undefined : depth.get(f.parent_folder_id);
        if (parentDepth !== undefined) {
          depth.set(f.id, parentDepth + 1);
          changed = true;
        }
      }
    }
    return foldersStore.all
      .map((f) => ({ folder: f, depth: depth.get(f.id) ?? 0 }))
      .sort((a, b) => a.depth - b.depth || a.folder.id - b.folder.id);
  });

  async function doMove(folderId: number | null): Promise<void> {
    busy = true;
    error = '';
    try {
      await moveNote(note, folderId);
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }
</script>

<Modal open onClose={onClose}>
  <div class="flex flex-col gap-2">
    <h2 class="px-2 pb-1 pt-1 text-lg font-semibold">Переместить в папку</h2>
    {#if error}
      <p class="px-2 pb-1 text-sm text-danger">{error}</p>
    {/if}

    <!-- Корень топика -->
    <button
      type="button"
      class="flex h-11 items-center rounded-xl px-2 text-base {note.folder_id === null
        ? 'cursor-default text-muted'
        : 'active:bg-border/50'}"
      disabled={busy || note.folder_id === null}
      onclick={() => doMove(null)}
    >
      <span class="w-7 shrink-0 text-center">📂</span> Корень
      {#if note.folder_id === null}
        <span class="ml-auto text-sm text-muted">здесь</span>
      {/if}
    </button>

    {#each tree as { folder, depth } (folder.id)}
      {@const active = note.folder_id === folder.id}
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

    <button
      type="button"
      class="mt-1 h-11 rounded-xl border border-border text-sm"
      onclick={onClose}
    >
      Отмена
    </button>
  </div>
</Modal>
