<script lang="ts">
  // Редактор текста заметки: крупное поле + тулбар стилей. Кнопки оборачивают
  // выделенный фрагмент markdown-маркерами (**жирный**, *курсив*, `код`,
  // [ссылка](url)) — теми, что понимает сервер (parseMarkdownEntities).
  // Сохранение — через notes store (saveText находит список, где лежит заметка:
  // активный/архив/выполненные).
  import { saveText } from '../stores/notes.svelte';
  import { markdownFromEntities } from '../utils/format';
  import type { Note } from '../types/api';

  let { note, onSaved, onCancel }: { note: Note; onSaved: () => void; onCancel: () => void } =
    $props();

  // В редакторе показываем разметку (**жирный** и т.п.), восстановленную из entities.
  let editText = $state(markdownFromEntities(note.text, note.entities));
  let busy = $state(false);
  let error = $state('');
  let textarea: HTMLTextAreaElement | undefined;

  // Ссылка: при активном режиме под тулбаром — строка ввода URL.
  let linkOpen = $state(false);
  let linkUrl = $state('');
  let linkInput = $state<HTMLInputElement | undefined>();

  $effect(() => {
    textarea?.focus();
  });

  function selection(): { start: number; end: number } {
    const ta = textarea;
    if (!ta) return { start: 0, end: 0 };
    return { start: ta.selectionStart ?? 0, end: ta.selectionEnd ?? 0 };
  }

  /** Обернуть выделение маркерами; пустое выделение — вставить с плейсхолдером. */
  function wrap(open: string, close: string, placeholder = 'текст'): void {
    const { start, end } = selection();
    const sel = editText.slice(start, end);
    const inner = sel === '' ? placeholder : sel;
    editText = editText.slice(0, start) + open + inner + close + editText.slice(end);
    requestAnimationFrame(() => {
      textarea?.focus();
      const selStart = start + open.length;
      textarea?.setSelectionRange(selStart, selStart + inner.length);
    });
  }

  function toggleLink(): void {
    linkOpen = !linkOpen;
    if (linkOpen) {
      requestAnimationFrame(() => linkInput?.focus());
    }
  }

  /** Ссылка: [выделение](url), без выделения — [ссылка](url). */
  function applyLink(): void {
    const url = linkUrl.trim();
    if (url === '') return;
    const { start, end } = selection();
    const sel = editText.slice(start, end);
    const label = sel === '' ? 'ссылка' : sel;
    editText = editText.slice(0, start) + `[${label}](${url})` + editText.slice(end);
    linkOpen = false;
    linkUrl = '';
    requestAnimationFrame(() => {
      textarea?.focus();
      // Курсор — после ]( (перед url), чтобы дописать/поправить адрес.
      const caret = start + label.length + 2;
      textarea?.setSelectionRange(caret, caret);
    });
  }

  async function submit(): Promise<void> {
    const value = editText.trim();
    if (value === '') {
      error = 'текст не может быть пустым';
      return;
    }
    busy = true;
    error = '';
    try {
      await saveText(note, value);
      onSaved();
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }
</script>

<form
  class="flex flex-col gap-3"
  onsubmit={(e) => {
    e.preventDefault();
    submit();
  }}
>
  <div class="flex flex-wrap items-center gap-1.5">
    <button
      type="button"
      aria-label="Жирный (**текст**)"
      title="Жирный"
      class="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-[15px] transition-colors active:bg-border/60"
      onclick={() => wrap('**', '**')}
    >
      <span class="font-bold">B</span>
    </button>
    <button
      type="button"
      aria-label="Курсив (*текст*)"
      title="Курсив"
      class="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-[15px] transition-colors active:bg-border/60"
      onclick={() => wrap('*', '*')}
    >
      <span class="italic">I</span>
    </button>
    <button
      type="button"
      aria-label="Код (`текст`)"
      title="Код"
      class="flex h-9 w-9 items-center justify-center rounded-lg bg-background font-mono text-[13px] transition-colors active:bg-border/60"
      onclick={() => wrap('`', '`', 'код')}
    >
      &lt;/&gt;
    </button>
    <button
      type="button"
      aria-label="Ссылка ([текст](url))"
      title="Ссылка"
      class="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-[15px] transition-colors active:bg-border/60 {linkOpen
        ? 'bg-border/60'
        : ''}"
      onclick={toggleLink}
    >
      🔗
    </button>
  </div>

  {#if linkOpen}
    <div class="flex items-center gap-2">
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:this={linkInput}
        bind:value={linkUrl}
        type="url"
        placeholder="https://…"
        autofocus
        class="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent"
      />
      <button
        type="button"
        class="h-10 shrink-0 rounded-xl bg-accent-strong px-4 text-sm font-medium text-white disabled:opacity-40"
        disabled={linkUrl.trim() === ''}
        onclick={applyLink}
      >
        Вставить
      </button>
    </div>
  {/if}

  <!-- Крупное поле: удобно редактировать заметку целиком -->
  <textarea
    bind:this={textarea}
    bind:value={editText}
    rows="8"
    class="max-h-[46dvh] min-h-44 w-full resize-y rounded-2xl border border-border bg-background px-4 py-3 text-base leading-6 outline-none focus:border-accent"
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
      onclick={onCancel}
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
