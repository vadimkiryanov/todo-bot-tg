<script lang="ts">
  // Компактная форма напоминания: datetime-local + once/daily + Отмена/Сохранить.
  // Используется в странице заметки и в панели создания заметки (InputBar).
  // Валидация как на сервере: одноразовое напоминание не может быть в прошлом.
  import Spinner from './Spinner.svelte';
  import type { ReminderRepeat } from '../types/api';

  let {
    initial = '',
    initialRepeat = 'once',
    busy = false,
    onSubmit,
    onCancel,
    onSaved,
  }: {
    /** Текущее напоминание (ISO 8601 UTC) или '' — нового нет. */
    initial?: string;
    initialRepeat?: ReminderRepeat;
    busy?: boolean;
    /** Вызывается при сохранении с ISO (UTC) и типом повторения. */
    onSubmit: (iso: string, repeat: ReminderRepeat) => Promise<void>;
    onCancel: () => void;
    /** Вызывается после успешного onSubmit. */
    onSaved: () => void;
  } = $props();

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

  // По умолчанию — ближайший получас.
  let value = $state(
    initial === ''
      ? isoToReminderInput(new Date(Date.now() + 30 * 60_000).toISOString())
      : isoToReminderInput(initial),
  );
  let repeat = $state<ReminderRepeat>(initialRepeat);
  let error = $state('');
  let pickerOpen = $state(false);
  const min = todayStartLocal();

  /** Тоггл нативного календаря: клик открывает, повторный клик закрывает (не переоткрывает). */
  function togglePicker(e: MouseEvent & { currentTarget: HTMLInputElement }): void {
    if (pickerOpen) {
      e.currentTarget.blur();
      pickerOpen = false;
      return;
    }
    try {
      e.currentTarget.showPicker();
      pickerOpen = true;
    } catch {
      // Safari: showPicker() для datetime-local недоступен — остаётся обычный фокус.
    }
  }

  async function submit(): Promise<void> {
    if (value === '') {
      error = 'выбери дату и время';
      return;
    }
    // Одноразовое напоминание не может быть в прошлом (то же правило, что на сервере).
    if (repeat === 'once' && new Date(reminderToISO(value)).getTime() <= Date.now()) {
      error = 'время напоминания уже прошло';
      return;
    }
    error = '';
    try {
      await onSubmit(reminderToISO(value), repeat);
      onSaved();
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    }
  }
</script>

<form
  class="flex flex-col gap-2 rounded-xl border border-border bg-background p-3"
  novalidate
  onsubmit={(e) => {
    e.preventDefault();
    submit();
  }}
>
  <!-- svelte-ignore a11y_autofocus -->
  <input
    type="datetime-local"
    bind:value
    autofocus
    min={min}
    onclick={togglePicker}
    onblur={() => {
      pickerOpen = false;
    }}
    oncancel={() => {
      pickerOpen = false;
    }}
    class="cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
  />
  <div class="flex gap-1 rounded-lg bg-border/40 p-1">
    {#each ['once', 'daily'] as item (item)}
      <button
        type="button"
        class="h-8 flex-1 rounded-md text-xs transition-colors {repeat === item
          ? 'bg-surface font-medium shadow-sm'
          : 'text-muted'}"
        onclick={() => {
          repeat = item as ReminderRepeat;
        }}
      >
        {item === 'once' ? 'Один раз' : 'Ежедневно'}
      </button>
    {/each}
  </div>
  {#if error}
    <p class="text-xs text-danger">{error}</p>
  {/if}
  <div class="flex gap-2">
    <button type="button" class="h-10 flex-1 rounded-lg border border-border text-sm" onclick={onCancel}>
      Отмена
    </button>
    <button
      type="submit"
      class="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-accent-strong text-sm font-medium text-white disabled:opacity-50"
      disabled={busy || value === ''}
    >
      {#if busy}
        <Spinner size="15px" />
      {:else}
        Сохранить
      {/if}
    </button>
  </div>
</form>
