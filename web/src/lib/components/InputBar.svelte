<script lang="ts">
  // Нижняя панель: поле ввода + кнопка отправки.
  // Enter — отправить, Shift+Enter — новая строка. После отправки поле очищается.
  import { createNote } from '../stores/notes.svelte';

  let text = $state('');
  let sending = $state(false);
  let input: HTMLTextAreaElement | undefined;

  async function send(): Promise<void> {
    const value = text.trim();
    if (value === '' || sending) return;
    sending = true;
    try {
      await createNote(value);
      text = '';
      resetHeight();
    } catch {
      // При ошибке текст остаётся в поле — пользователь видит и может повторить.
    } finally {
      sending = false;
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  function autoResize(): void {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
  }

  function resetHeight(): void {
    if (input) input.style.height = '';
  }
</script>

<div class="flex items-end gap-2 px-3 py-2">
  <textarea
    bind:this={input}
    bind:value={text}
    rows="1"
    placeholder="Написать заметку…"
    onkeydown={onKeydown}
    oninput={autoResize}
    class="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-base leading-5 outline-none placeholder:text-muted focus:border-accent"
  ></textarea>
  <button
    type="button"
    aria-label="Отправить"
    class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-strong text-xl text-white transition-opacity disabled:opacity-40"
    disabled={sending || text.trim() === ''}
    onclick={send}
  >
    ➤
  </button>
</div>
