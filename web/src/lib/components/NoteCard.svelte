<script lang="ts">
  // Карточка заметки: превью первой строки, слева — 📌 или эмодзи приоритета.
  // Выполненная — зачёркнута и приглушена. Тап — открыть оверлей.
  import type { Note } from '../types/api';

  let { note, onOpen }: { note: Note; onOpen: (note: Note) => void } = $props();

  const preview = $derived(note.text.split('\n')[0]);
  const marker = $derived(
    note.pinned
      ? '📌'
      : note.priority === 'high'
        ? '🔴'
        : note.priority === 'medium'
          ? '🟡'
          : note.priority === 'low'
            ? '🔵'
            : null,
  );
</script>

<button
  type="button"
  class="flex w-full items-start gap-2.5 rounded-2xl bg-surface px-4 py-3 text-left shadow-sm transition-colors active:bg-border/50"
  onclick={() => onOpen(note)}
>
  {#if marker !== null}
    <span class="w-5 shrink-0 text-center text-sm leading-6">{marker}</span>
  {/if}
  <span
    class="min-w-0 flex-1 text-[15px] leading-6 {note.done
      ? 'text-muted line-through'
      : 'text-content'}"
  >
    {preview}
  </span>
</button>
