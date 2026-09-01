<script lang="ts">
  // Нижняя панель: бургер-меню (архив/выход) + поле ввода + кнопка отправки.
  // Enter — отправить, Shift+Enter — новая строка. После отправки поле очищается.
  import { goto } from '$app/navigation';
  import { createNote, loadArchived } from '../stores/notes.svelte';
  import { logout } from '../stores/session.svelte';

  let text = $state('');
  let sending = $state(false);
  let input: HTMLTextAreaElement | undefined;

  // Бургер-меню: архив и выход (раньше были в шапке).
  let menuOpen = $state(false);

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

  function toggleMenu(): void {
    menuOpen = !menuOpen;
  }

  function closeMenu(): void {
    menuOpen = false;
  }

  async function goArchived(): Promise<void> {
    // Сразу грузим архив — экран покажет данные без повторного запроса.
    closeMenu();
    await loadArchived();
    await goto('/archive');
  }

  async function doLogout(): Promise<void> {
    closeMenu();
    await logout();
    await goto('/login');
  }

  // Escape закрывает бургер-меню.
  $effect(() => {
    if (!menuOpen) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });
</script>

<div class="relative flex items-end gap-2 px-3 py-2">
  {#if menuOpen}
    <!-- Затемняющая подложка: тап вне меню — закрыть -->
    <div class="backdrop-anim fixed inset-0 z-40 bg-black/40" onclick={closeMenu} aria-hidden="true"></div>
    <div
      class="menu-anim absolute bottom-full left-2 z-50 mb-2 flex w-56 flex-col gap-1 rounded-2xl border border-border bg-surface p-2 shadow-xl"
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        class="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left transition-colors active:bg-border/50"
        onclick={() => void goArchived()}
      >
        <span class="w-6 shrink-0 text-center text-base">🗄</span>
        Архив
      </button>
      <button
        type="button"
        role="menuitem"
        class="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left transition-colors active:bg-border/50"
        onclick={() => void doLogout()}
      >
        <span class="w-6 shrink-0 text-center text-base">🚪</span>
        Выход
      </button>
    </div>
  {/if}

  <button
    type="button"
    aria-label="Меню"
    aria-expanded={menuOpen}
    class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background text-lg text-muted transition-[background-color,transform] active:scale-90 active:bg-border"
    onclick={toggleMenu}
  >
    ☰
  </button>
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
    class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-strong text-xl text-white transition-[opacity,transform] active:scale-90 disabled:opacity-40"
    disabled={sending || text.trim() === ''}
    onclick={send}
  >
    ➤
  </button>
</div>
