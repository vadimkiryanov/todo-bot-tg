<script lang="ts">
  // Нижняя панель: белая панель с инпутом, где слева от textarea стоит
  // бургер ☰ (как раньше); кнопка шторки топиков/папок 📚 парит абсолютом
  // над панелью (над бургером), вне белой заливки. При вводе текста над
  // инпутом появляется панель действий новой заметки: 🔴🟡🔵 приоритет (цикл),
  // ⏰ напоминание (модалка), 📌 закрепление.
  // Enter — отправить, Shift+Enter — новая строка. После отправки поле очищается.
  import { goto } from '$app/navigation';
  import Modal from './Modal.svelte';
  import ReminderForm from './ReminderForm.svelte';
  import { createNote, loadArchived, loadDone } from '../stores/notes.svelte';
  import { logout } from '../stores/session.svelte';
  import { nextPriority, priorityEmoji, priorityLabel } from '../utils/format';
  import type { Priority, ReminderRepeat } from '../types/api';

  let {
    /** Открыть шторку топиков/папок (ContextStrip). */
    onOpenTopics,
  }: { onOpenTopics?: () => void } = $props();

  let text = $state('');
  let sending = $state(false);
  let input: HTMLTextAreaElement | undefined;

  // Опции создания: приоритет / закреплено / напоминание.
  let priority = $state<Priority>('none');
  let pinned = $state(false);
  let reminderAt = $state<string | null>(null); // ISO 8601 UTC
  let reminderRepeat = $state<ReminderRepeat>('once');
  let showReminderForm = $state(false);

  // Бургер-меню: архив и выход (раньше были в шапке).
  let menuOpen = $state(false);

  async function send(): Promise<void> {
    const value = text.trim();
    if (value === '' || sending) return;
    sending = true;
    try {
      await createNote(value, {
        priority,
        pinned,
        reminder_at: reminderAt ?? undefined,
        reminder_repeat: reminderAt ? reminderRepeat : undefined,
      });
      text = '';
      resetHeight();
      // Сброс опций после отправки.
      priority = 'none';
      pinned = false;
      reminderAt = null;
      reminderRepeat = 'once';
      showReminderForm = false;
    } catch {
      // При ошибке текст остаётся в поле — пользователь видит и может повторить.
    } finally {
      sending = false;
    }
  }

  /** Тап по ⏰: открыть модалку напоминания или снять уже заданное. */
  function toggleReminderForm(): void {
    if (reminderAt !== null) {
      reminderAt = null;
      showReminderForm = false;
      return;
    }
    showReminderForm = true;
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

  async function goDone(): Promise<void> {
    // Сразу грузим выполненные — экран покажет данные без повторного запроса.
    closeMenu();
    await loadDone();
    await goto('/done');
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

<div class="relative px-3 py-2">
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
        onclick={() => void goDone()}
      >
        <span class="w-6 shrink-0 text-center text-base">✅</span>
        Выполненные
      </button>
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

  {#if showReminderForm}
    <Modal open onClose={() => (showReminderForm = false)}>
      <div class="flex flex-col gap-1 px-1 py-2">
        <h2 class="text-center text-sm text-muted">⏰ Напоминание</h2>
        <ReminderForm
          initial={reminderAt ?? ''}
          initialRepeat={reminderRepeat}
          busy={sending}
          onSubmit={async (iso, repeat) => {
            reminderAt = iso;
            reminderRepeat = repeat;
          }}
          onSaved={() => {
            showReminderForm = false;
          }}
          onCancel={() => {
            showReminderForm = false;
          }}
        />
      </div>
    </Modal>
  {/if}

  <!-- Кнопка шторки топиков/папок: парит над нижней панелью слева (над ☰),
       вне белой заливки — справа от неё видны заметки чата -->
  <button
    type="button"
    aria-label="Топики и папки"
    class="absolute bottom-full left-3 mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-lg text-muted transition-[background-color,transform] active:scale-90 active:bg-border"
    onclick={onOpenTopics}
  >
    📚
  </button>

  <div class="flex flex-col gap-1.5">
    {#if text.trim() !== ''}
      <!-- Панель действий новой заметки (видна при вводе текста) -->
      <div class="flex items-center gap-2 px-1">
        <button
          type="button"
          aria-label={`Приоритет: ${priorityLabel(priority)}`}
          aria-pressed={priority !== 'none'}
          title={`Приоритет: ${priorityLabel(priority)}`}
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg transition-[background-color,transform] active:scale-90 {priority !==
          'none'
            ? 'bg-border/60'
            : 'bg-background'}"
          onclick={() => (priority = nextPriority(priority))}
        >
          {priorityEmoji(priority)}
        </button>
        <button
          type="button"
          aria-label={reminderAt !== null ? 'Снять напоминание' : 'Добавить напоминание'}
          aria-pressed={reminderAt !== null}
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg transition-[background-color,transform] active:scale-90 {reminderAt !==
          null
            ? 'bg-border/60'
            : 'bg-background'}"
          onclick={toggleReminderForm}
        >
          ⏰
        </button>
        <button
          type="button"
          aria-label={pinned ? 'Открепить' : 'Закрепить'}
          aria-pressed={pinned}
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg transition-[background-color,transform] active:scale-90 {pinned
            ? 'bg-border/60'
            : 'bg-background'}"
          onclick={() => (pinned = !pinned)}
        >
          📌
        </button>
      </div>
    {/if}

    <div class="flex items-end gap-1.5">
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
  </div>
</div>
