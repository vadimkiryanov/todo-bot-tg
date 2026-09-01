<script lang="ts">
  // Карточка заметки: превью первой строки (с форматированием), слева — 📌 или эмодзи приоритета.
  // Справа — ⏰ при установленном напоминании. Выполненная — зачёркнута и приглушена.
  // Тап — открыть оверлей.
  import type { Note } from '../types/api';
  import { firstLineHtml, formatReminderAt } from '../utils/format';

  let { note, onOpen }: { note: Note; onOpen: (note: Note) => void } = $props();

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

  const reminder = $derived(
    note.reminder_at !== null ? formatReminderAt(note.reminder_at, note.reminder_repeat) : null,
  );
</script>

<button
  type="button"
  class="flex w-full select-none items-start gap-2.5 rounded-2xl bg-surface px-4 py-3 text-left shadow-sm transition-[background-color,transform] active:scale-[0.98] active:bg-border/50"
  onclick={() => onOpen(note)}
>
  {#if marker !== null}
    <span class="w-5 shrink-0 text-center text-sm leading-6">{marker}</span>
  {/if}
  <span
    class="min-w-0 flex-1 text-[15px] leading-6 [&_a]:text-accent [&_a]:underline {note.done
      ? 'text-muted line-through'
      : 'text-content'}"
  >
    {@html firstLineHtml(note.text, note.entities)}
  </span>
  {#if reminder !== null}
    <span class="shrink-0 text-sm leading-6" title={`⏰ ${reminder}`}>⏰</span>
  {/if}
</button>
