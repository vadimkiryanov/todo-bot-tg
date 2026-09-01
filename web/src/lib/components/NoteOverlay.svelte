<script lang="ts">
  // Оверлей заметки: полный текст + действия.
  // ✅ — выполнить/вернуть, 🔴🟡🔵 — приоритет (тап по активному снимает),
  // ✏️ — редактирование, 🗑 — удаление с подтверждением,
  // ⏰ — напоминание (выбор даты/времени, once/daily, отложить +15м/+30м/+1ч).
  import ConfirmModal from './ConfirmModal.svelte';
  import Modal from './Modal.svelte';
  import MoveModal from './MoveModal.svelte';
  import {
    archiveNote,
    clearReminder,
    removeNote,
    saveText,
    setPriority,
    setReminder,
    toggleDone,
    togglePin,
  } from '../stores/notes.svelte';
  import type { Note, ReminderRepeat } from '../types/api';
  import {
    formatReminderAt,
    markdownFromEntities,
    nextPriority,
    priorityEmoji,
    priorityLabel,
    renderNoteHtml,
  } from '../utils/format';

  let { note, onClose }: { note: Note; onClose: () => void } = $props();

  let editing = $state(false);
  let editText = $state('');
  let busy = $state(false);
  let error = $state('');
  let confirmDelete = $state(false);
  let showMove = $state(false);

  // Напоминание
  let showReminderForm = $state(false);
  let reminderInput = $state(''); // datetime-local: локальное время без зоны
  let reminderRepeat = $state<ReminderRepeat>('once');
  let reminderError = $state('');
  let reminderPickerOpen = $state(false);
  let reminderMin = $state(''); // min нативного пикера: начало текущего дня (локальное время)

  /** datetime-local (локальное время) → ISO 8601 UTC для API. */
  function reminderToISO(value: string): string {
    return new Date(value).toISOString();
  }

  /** ISO 8601 UTC → значение datetime-local (локальное время). */
  function isoToReminderInput(iso: string): string {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }

  /** Начало текущего дня в локальном времени (для min пикера). */
  function todayStartLocal(): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }

  function openReminderForm(): void {
    // Заполняем существующим временем или ближайшим получасом.
    reminderInput =
      note.reminder_at !== null
        ? isoToReminderInput(note.reminder_at)
        : isoToReminderInput(new Date(Date.now() + 30 * 60_000).toISOString());
    reminderRepeat = note.reminder_at !== null ? note.reminder_repeat : 'once';
    reminderMin = todayStartLocal();
    reminderError = '';
    showReminderForm = true;
  }

  /** Тоггл нативного календаря: клик открывает, повторный клик закрывает (не переоткрывает). */
  function toggleReminderPicker(e: MouseEvent & { currentTarget: HTMLInputElement }): void {
    if (reminderPickerOpen) {
      e.currentTarget.blur();
      reminderPickerOpen = false;
      return;
    }
    try {
      e.currentTarget.showPicker();
      reminderPickerOpen = true;
    } catch {
      // Safari: showPicker() для datetime-local недоступен — остаётся обычный фокус.
    }
  }

  function cancelReminderForm(): void {
    showReminderForm = false;
    reminderError = '';
  }

  async function saveReminder(): Promise<void> {
    if (reminderInput === '') {
      reminderError = 'выбери дату и время';
      return;
    }
    // Одноразовое напоминание не может быть в прошлом (то же правило, что на сервере).
    if (reminderRepeat === 'once' && new Date(reminderToISO(reminderInput)).getTime() <= Date.now()) {
      reminderError = 'время напоминания уже прошло';
      return;
    }
    busy = true;
    reminderError = '';
    try {
      await setReminder(note, reminderToISO(reminderInput), reminderRepeat);
      showReminderForm = false;
    } catch (e) {
      reminderError = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
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
        class="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-base leading-5 outline-none focus:border-accent"
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
              onclick={() => {
                if (showReminderForm) {
                  cancelReminderForm();
                } else {
                  openReminderForm();
                }
                error = '';
              }}
            >
              ⏰ Напомнить
            </button>
          {/if}

          {#if showReminderForm}
            <form
              class="flex flex-col gap-2 rounded-xl border border-border bg-background p-3"
              novalidate
              onsubmit={(e) => {
                e.preventDefault();
                saveReminder();
              }}
            >
              <!-- svelte-ignore a11y_autofocus -->
              <input
                type="datetime-local"
                bind:value={reminderInput}
                autofocus
                min={reminderMin}
                onclick={toggleReminderPicker}
                onblur={() => {
                  reminderPickerOpen = false;
                }}
                oncancel={() => {
                  reminderPickerOpen = false;
                }}
                class="cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <div class="flex gap-1 rounded-lg bg-border/40 p-1">
                {#each ['once', 'daily'] as value (value)}
                  <button
                    type="button"
                    class="h-8 flex-1 rounded-md text-xs transition-colors {reminderRepeat ===
                    value
                      ? 'bg-surface font-medium shadow-sm'
                      : 'text-muted'}"
                    onclick={() => {
                      reminderRepeat = value as ReminderRepeat;
                    }}
                  >
                    {value === 'once' ? 'Один раз' : 'Ежедневно'}
                  </button>
                {/each}
              </div>
              {#if reminderError}
                <p class="text-xs text-danger">{reminderError}</p>
              {/if}
              <div class="flex gap-2">
                <button
                  type="button"
                  class="h-10 flex-1 rounded-lg border border-border text-sm"
                  onclick={cancelReminderForm}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  class="h-10 flex-1 rounded-lg bg-accent-strong text-sm font-medium text-white disabled:opacity-50"
                  disabled={busy || reminderInput === ''}
                >
                  Сохранить
                </button>
              </div>
            </form>
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
