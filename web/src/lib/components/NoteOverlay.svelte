<script lang="ts">
  // Оверлей заметки: полный текст + действия.
  // ✅ — выполнить/вернуть, 🔴🟡🔵 — приоритет (тап по активному снимает),
  // ✏️ — редактирование, 🗑 — удаление с подтверждением,
  // ⏰ — напоминание (выбор даты/времени, once/daily, отложить +15м/+30м/+1ч).
  import ConfirmModal from './ConfirmModal.svelte';
  import Modal from './Modal.svelte';
  import MoveModal from './MoveModal.svelte';
  import NoteEditForm from './NoteEditForm.svelte';
  import ReminderForm from './ReminderForm.svelte';
  import {
    archiveNote,
    clearReminder,
    removeNote,
    setPriority,
    setReminder,
    toggleDone,
    togglePin,
  } from '../stores/notes.svelte';
  import type { Note } from '../types/api';
  import {
    formatReminderAt,
    nextPriority,
    priorityEmoji,
    priorityLabel,
    renderNoteHtml,
  } from '../utils/format';

  let {
    note,
    onClose,
    /** Открыть оверлей сразу в режиме редактирования (пункт «✏️ Редактировать»
     *  в контекстном меню). Имеет смысл только в момент открытия. */
    startEditing = false,
  }: {
    note: Note;
    onClose: () => void;
    startEditing?: boolean;
  } = $props();

  let editing = $state(startEditing);
  let busy = $state(false);
  let error = $state('');
  let confirmDelete = $state(false);
  let showMove = $state(false);

  // Напоминание
  let showReminderForm = $state(false);

  /** Тоггл формы напоминания (кнопка «⏰ Напомнить»). */
  function toggleReminderForm(): void {
    showReminderForm = !showReminderForm;
    error = '';
  }

  async function doClearReminder(): Promise<void> {
    busy = true;
    error = '';
    try {
      await clearReminder(note);
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  /** Отложить: сдвинуть на N минут, сохраняя тип повторения. */
  async function snooze(minutes: number): Promise<void> {
    busy = true;
    error = '';
    try {
      const at = new Date(Date.now() + minutes * 60_000).toISOString();
      await setReminder(note, at, note.reminder_repeat);
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  function startEdit(): void {
    editing = true;
    error = '';
  }

  function cancelEdit(): void {
    editing = false;
    error = '';
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

  /** Циклическое переключение приоритета (как в боте: клик по кнопке статуса). */
  async function doCyclePriority(): Promise<void> {
    busy = true;
    error = '';
    try {
      await setPriority(note, nextPriority(note.priority));
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
  {#if editing}
    <h2 class="mb-3 text-lg font-semibold">✏️ Редактировать</h2>
    <NoteEditForm {note} onCancel={cancelEdit} onSaved={cancelEdit} />
  {:else}
    <div class="flex flex-col gap-4 px-1 py-2">
      <div
        class="whitespace-pre-wrap break-words text-[15px] leading-6 [&_a]:text-accent [&_a]:underline [&_code]:rounded [&_code]:bg-border/40 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-border/40 [&_pre]:p-2 {note.done
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
            class="flex h-11 w-11 items-center justify-center rounded-full text-lg transition-transform active:scale-90 {note.done
              ? 'bg-border/60'
              : 'bg-background'}"
            disabled={busy}
            onclick={doToggleDone}
          >
            ✅
          </button>

          <button
            type="button"
            aria-label={`Приоритет: ${priorityLabel(note.priority)} — нажмите, чтобы изменить`}
            class="flex h-11 min-w-11 items-center justify-center gap-0.5 rounded-full px-2 text-base transition-transform active:scale-90 {note.priority ===
            'none'
              ? 'bg-background opacity-60'
              : 'bg-background'}"
            disabled={busy}
            onclick={doCyclePriority}
          >
            🔄{priorityEmoji(note.priority)}
          </button>
        </div>

        <div class="flex items-center justify-between gap-1">
          <button
            type="button"
            aria-label={note.pinned ? 'Открепить' : 'Закрепить'}
            class="flex h-11 w-11 items-center justify-center rounded-full text-lg transition-transform active:scale-90 {note.pinned
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

        {#if !note.done}
          {#if note.reminder_at !== null}
            <div class="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
              <div class="flex items-center justify-between gap-2">
                <span class="min-w-0 truncate text-sm" title={note.reminder_at}>
                  ⏰ {formatReminderAt(note.reminder_at, note.reminder_repeat)}
                </span>
                <button
                  type="button"
                  class="shrink-0 rounded-lg px-2 py-1 text-xs text-muted transition-colors active:bg-border/60"
                  disabled={busy}
                  onclick={doClearReminder}
                >
                  Снять
                </button>
              </div>
              <div class="flex gap-2">
                {#each [15, 30, 60] as minutes (minutes)}
                  <button
                    type="button"
                    class="h-9 flex-1 rounded-lg border border-border bg-background text-xs transition-transform active:scale-95"
                    disabled={busy}
                    onclick={() => snooze(minutes)}
                  >
                    +{minutes === 60 ? '1ч' : `${minutes}м`}
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <button
              type="button"
              class="h-11 rounded-xl border border-border text-sm disabled:opacity-50 {showReminderForm
                ? 'border-accent bg-accent/10'
                : ''}"
              disabled={busy}
              onclick={toggleReminderForm}
            >
              ⏰ Напомнить
            </button>
          {/if}

          {#if showReminderForm}
            <ReminderForm
              initial={note.reminder_at ?? ''}
              initialRepeat={note.reminder_repeat}
              {busy}
              onSubmit={async (iso, repeat) => {
                await setReminder(note, iso, repeat);
              }}
              onSaved={() => {
                showReminderForm = false;
              }}
              onCancel={() => {
                showReminderForm = false;
              }}
            />
          {/if}
        {/if}

        <button
          type="button"
          class="h-11 rounded-xl border border-border text-sm disabled:opacity-50"
          disabled={busy}
          onclick={() => {
            showMove = true;
            error = '';
          }}
        >
          📂 Переместить
        </button>
      </div>
    </div>
  {/if}
</Modal>

{#if confirmDelete}
  <ConfirmModal
    title="Удалить заметку?"
    text="Заметка будет удалена безвозвратно"
    {busy}
    {error}
    onClose={() => {
      confirmDelete = false;
      error = '';
    }}
    onConfirm={doDelete}
  />
{/if}

{#if showMove}
  <MoveModal
    {note}
    onClose={() => {
      showMove = false;
      onClose();
    }}
  />
{/if}
