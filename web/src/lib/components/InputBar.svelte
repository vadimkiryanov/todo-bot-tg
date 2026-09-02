<script lang="ts">
  // Нижняя панель: белая панель с инпутом, где слева от textarea стоит
  // бургер ☰ (как раньше). Над панелью парит столбик из двух кнопок:
  // 📁 «Папки» (выше) и 📚 «Топики» (ниже, как раньше) — вне белой заливки,
  // справа от них видны заметки чата. Каждая открывает свою шторку.
  // При вводе текста над инпутом появляется панель действий новой заметки:
  // 🔴🟡🔵 приоритет (цикл), ⏰ напоминание (модалка), 📌 закрепление.
  // Тап по кнопкам панели/плавающим кнопкам не уводит фокус из поля ввода —
  // можно нажимать опции и продолжать набор.
  // Enter — отправить, Shift+Enter — новая строка. После отправки поле очищается.
  import { goto } from '$app/navigation';
  import Modal from './Modal.svelte';
  import ReminderForm from './ReminderForm.svelte';
  import SettingsSheet from './SettingsSheet.svelte';
  import { createNote, loadArchived, loadDone } from '../stores/notes.svelte';
  import { navigation } from '../stores/navigation.svelte';
  import { logout } from '../stores/session.svelte';
  import { settings } from '../stores/settings.svelte';
  import { nextPriority, priorityEmoji, priorityLabel } from '../utils/format';
  import type { Priority, ReminderRepeat } from '../types/api';

  let {
    /** Открыть шторку топиков. */
    onOpenTopics,
    /** Открыть шторку папок. */
    onOpenFolders,
  }: {
    onOpenTopics?: () => void;
    onOpenFolders?: () => void;
  } = $props();

  let text = $state('');
  let sending = $state(false);
  let input: HTMLTextAreaElement | undefined;

  // Опции создания: приоритет / закреплено / напоминание.
  let priority = $state<Priority>('none');
  let pinned = $state(false);
  let reminderAt = $state<string | null>(null); // ISO 8601 UTC
  let reminderRepeat = $state<ReminderRepeat>('once');
  let showReminderForm = $state(false);

  // Бургер-меню: выполненные, архив, настройки и выход.
  let menuOpen = $state(false);
  // Шторка настроек: открывается из бургер-меню (⚙️ Настройки).
  let settingsOpen = $state(false);

  const folderActive = $derived(navigation.activeFolderID !== null);

  /** Вернуть фокус в поле ввода после тапа по кнопке (панель действий и т.п.):
      иначе на десктопе кнопка забирает фокус и набор прерывается. */
  function keepInputFocus(): void {
    requestAnimationFrame(() => input?.focus({ preventScroll: true }));
  }

  /** Тап по кнопке, не прерывающий набор: выполнить действие + вернуть фокус. */
  function press(action: () => void): void {
    action();
    keepInputFocus();
  }

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
      // Сразу можно писать следующую заметку.
      keepInputFocus();
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
    if (!menuOpen) keepInputFocus();
  }

  function closeMenu(): void {
    menuOpen = false;
    keepInputFocus();
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

  /** Открыть настройки: бургер закрываем без возврата фокуса в инпут
      (иначе на мобильных над шторкой вылезет клавиатура). */
  function openSettings(): void {
    menuOpen = false;
    settingsOpen = true;
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
      class="glass-menu menu-anim absolute bottom-full left-2 z-50 mb-2 flex w-56 flex-col gap-1 rounded-2xl p-2 shadow-xl"
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
        onclick={openSettings}
      >
        <span class="w-6 shrink-0 text-center text-base">⚙️</span>
        Настройки
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
    <Modal
      open
      onClose={() => {
        showReminderForm = false;
        keepInputFocus();
      }}
    >
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
            keepInputFocus();
          }}
          onCancel={() => {
            showReminderForm = false;
            keepInputFocus();
          }}
        />
      </div>
    </Modal>
  {/if}

  {#if settingsOpen}
    <SettingsSheet
      open
      onClose={() => {
        settingsOpen = false;
        keepInputFocus();
      }}
    />
  {/if}

  <!-- Плавающие кнопки над нижней панелью (слева, вне белой заливки):
       📚 «Топики» — шторка топиков. 📁 «Папки» показываем только в режиме
       «Отдельная кнопка»: в режиме «в списке» папки видны строками прямо
       в списке заметок, отдельная кнопка не нужна (строка текущей папки
       над списком остаётся в обоих режимах). Тап не уводит фокус из ввода. -->
  <div class="absolute bottom-full left-3 mb-2 flex flex-col items-center gap-2">
    {#if settings.foldersMode === 'button'}
      <button
        type="button"
        aria-label="Папки"
        aria-expanded={folderActive}
        title={folderActive ? 'Вы в папке — открыть папки' : 'Открыть папки'}
        class="glass-fab flex h-11 w-11 items-center justify-center rounded-full text-lg transition-[background-color,transform] active:scale-90 {folderActive
          ? 'text-accent'
          : 'text-muted'}"
        onclick={() => press(() => onOpenFolders?.())}
      >
        📁
      </button>
    {/if}
    <button
      type="button"
      aria-label="Топики"
      class="glass-fab flex h-11 w-11 items-center justify-center rounded-full text-lg text-muted transition-[background-color,transform] active:scale-90"
      onclick={() => press(() => onOpenTopics?.())}
    >
      📚
    </button>
  </div>

  <div class="flex flex-col gap-1.5">
    {#if text.trim() !== ''}
      <!-- Панель действий новой заметки (видна при вводе текста): тап по
           кнопке не уводит фокус из поля ввода (press возвращает фокус) -->
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
          onclick={() => press(() => (priority = nextPriority(priority)))}
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
          onclick={() => press(toggleReminderForm)}
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
          onclick={() => press(() => (pinned = !pinned))}
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
