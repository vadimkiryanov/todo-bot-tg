<script lang="ts">
  // Оверлей заметки: полный текст + действия.
  // ✅ — выполнить/вернуть, 🔴🟡🔵 — приоритет (тап по активному снимает),
  // ✏️ — редактирование, 🗑 — удаление с подтверждением.
  import Modal from './Modal.svelte';
  import {
    archiveNote,
    removeNote,
    saveText,
    setPriority,
    toggleDone,
    togglePin,
  } from '../stores/notes.svelte';
  import type { Note, Priority } from '../types/api';
  import { markdownFromEntities, renderNoteHtml } from '../utils/format';

  let { note, onClose }: { note: Note; onClose: () => void } = $props();

  const priorities: { value: Priority; emoji: string }[] = [
    { value: 'high', emoji: '🔴' },
    { value: 'medium', emoji: '🟡' },
    { value: 'low', emoji: '🔵' },
  ];

  let editing = $state(false);
  let editText = $state('');
  let busy = $state(false);
  let error = $state('');
  let confirmDelete = $state(false);

  function startEdit(): void {
    // В редакторе показываем разметку (**жирный** и т.п.), восстановленную из entities.
    editText = markdownFromEntities(note.text, note.entities);
    editing = true;
    error = '';
  }

  function cancelEdit(): void {
    editing = false;
    error = '';
  }

  async function submitEdit(): Promise<void> {
    const value = editText.trim();
    if (value === '') {
      error = 'текст не может быть пустым';
      return;
    }
    busy = true;
    error = '';
    try {
      await saveText(note, value);
      editing = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  async function doToggleDone(): Promise<void> {
    busy = true;
    error = '';
    try {
      await toggleDone(note);
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  async function doSetPriority(priority: Priority): Promise<void> {
    busy = true;
    error = '';
    try {
      // Тап по активному приоритету — снять (none).
      await setPriority(note, note.priority === priority ? 'none' : priority);
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  async function doTogglePin(): Promise<void> {
    busy = true;
    error = '';
    try {
      await togglePin(note);
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  async function doArchive(): Promise<void> {
    busy = true;
    error = '';
    try {
      await archiveNote(note);
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
      busy = false;
    }
  }

  async function doDelete(): Promise<void> {
    busy = true;
    error = '';
    try {
      await removeNote(note);
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
      busy = false;
    }
  }
</script>

<Modal open onClose={onClose}>
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
          onclick={doDelete}
        >
          Удалить
        </button>
      </div>
    </div>
  {:else if editing}
    <form
      class="flex flex-col gap-3"
      onsubmit={(e) => {
        e.preventDefault();
        submitEdit();
      }}
    >
      <!-- svelte-ignore a11y_autofocus -->
      <textarea
        bind:value={editText}
        rows="4"
        autofocus
        class="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-[15px] leading-5 outline-none focus:border-accent"
      ></textarea>
      <p class="text-xs text-muted">
        **жирный**, *курсив*, `код`, [ссылка](https://…)
      </p>
      {#if error}
        <p class="text-sm text-danger">{error}</p>
      {/if}
      <div class="flex gap-2">
        <button
          type="button"
          class="h-11 flex-1 rounded-xl border border-border text-sm"
          onclick={cancelEdit}
        >
          Отмена
        </button>
        <button
          type="submit"
          class="h-11 flex-1 rounded-xl bg-accent-strong text-sm font-medium text-white disabled:opacity-50"
          disabled={busy}
        >
          Сохранить
        </button>
      </div>
    </form>
  {:else}
    <div class="flex flex-col gap-4 px-1 py-2">
      <div
        class="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-[15px] leading-6 [&_a]:text-accent [&_a]:underline [&_code]:rounded [&_code]:bg-border/40 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-border/40 [&_pre]:p-2 {note.done
          ? 'text-muted line-through'
          : 'text-content'}"
      >
        {@html renderNoteHtml(note.text, note.entities)}
      </div>

      {#if error}
        <p class="text-sm text-danger">{error}</p>
      {/if}

      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-1">
          <button
            type="button"
            aria-label={note.done ? 'Вернуть в работу' : 'Выполнить'}
            class="flex h-11 w-11 items-center justify-center rounded-full text-lg {note.done
              ? 'bg-border/60'
              : 'bg-background'}"
            disabled={busy}
            onclick={doToggleDone}
          >
            ✅
          </button>

          {#each priorities as p (p.value)}
            <button
              type="button"
              aria-label={`Приоритет ${p.value}`}
              class="flex h-11 w-11 items-center justify-center rounded-full text-lg {note.priority ===
              p.value
                ? 'bg-border/60'
                : 'bg-background'}"
              disabled={busy}
              onclick={() => doSetPriority(p.value)}
            >
              {p.emoji}
            </button>
          {/each}
        </div>

        <div class="flex items-center justify-between gap-1">
          <button
            type="button"
            aria-label={note.pinned ? 'Открепить' : 'Закрепить'}
            class="flex h-11 w-11 items-center justify-center rounded-full text-lg {note.pinned
              ? 'bg-border/60'
              : 'bg-background'}"
            disabled={busy}
            onclick={doTogglePin}
          >
            📌
          </button>

          <button
            type="button"
            aria-label="В архив"
            class="flex h-11 w-11 items-center justify-center rounded-full bg-background text-lg"
            disabled={busy}
            onclick={doArchive}
          >
            🗄
          </button>

          <button
            type="button"
            aria-label="Редактировать"
            class="flex h-11 w-11 items-center justify-center rounded-full bg-background text-lg"
            disabled={busy}
            onclick={startEdit}
          >
            ✏️
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
    </div>
  {/if}
</Modal>
