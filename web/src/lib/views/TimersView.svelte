<script lang="ts">
  // Экран «⏰ Таймеры» (URL /timers): все заметки с установленным напоминанием,
  // из любых топиков — как /timers в боте. Каждая строка: эмодзи статуса +
  // превью + время напоминания и режим (🔂 разовый / 🔁 ежедневный).
  // Тап по строке — полноэкранная «страница» заметки (NotePage).
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import NotePage from '$lib/components/NotePage.svelte';
  import { loadTimers, timersStore } from '$lib/stores/notes.svelte';
  import { logout } from '$lib/stores/session.svelte';
  import type { Note } from '$lib/types/api';
  import { firstLineHtml, formatReminderAt, priorityEmoji } from '$lib/utils/format';

  // Открытая заметка: кэш объекта — заметка может исчезнуть из списка
  // (таймер снят/выполнена/удалена) раньше, чем доиграет закрытие страницы.
  let selectedId: number | null = $state(null);
  let selectedCache: Note | null = $state(null);
  $effect(() => {
    if (selectedId === null) {
      selectedCache = null;
      return;
    }
    const found = timersStore.notes.find((n) => n.id === selectedId);
    if (found) selectedCache = found;
  });

  function closePage(): void {
    selectedId = null;
  }

  onMount(() => {
    void loadTimers();
  });

  async function doLogout(): Promise<void> {
    await logout();
    await goto('/login');
  }
</script>

<div class="flex h-full flex-col">
  <header
    class="flex shrink-0 items-center justify-between border-b border-border bg-surface px-3 pt-[env(safe-area-inset-top)]"
  >
    <button
      type="button"
      aria-label="Назад"
      class="flex h-10 w-10 items-center justify-center rounded-full text-lg active:bg-border/50"
      onclick={() => void goto('/')}
    >
      ←
    </button>
    <span class="text-xl">⏰</span>
    <button
      type="button"
      aria-label="Выйти"
      class="flex h-10 w-10 items-center justify-center rounded-full text-lg active:bg-border/50"
      onclick={() => void doLogout()}
    >
      🚪
    </button>
  </header>

  <main class="scroll-area flex-1 overflow-y-auto">
    {#if timersStore.loading}
      <EmptyState emoji="⏳" />
    {:else if timersStore.error}
      <div class="flex flex-col items-center gap-4 px-6 py-16">
        <EmptyState emoji="⚠️" text={timersStore.error} />
        <button
          type="button"
          class="h-11 rounded-xl border border-border px-6 text-sm"
          onclick={() => void loadTimers()}
        >
          Повторить
        </button>
      </div>
    {:else if timersStore.notes.length === 0}
      <EmptyState emoji="⏰" text="Таймеров нет" />
    {:else}
      <div class="flex flex-col gap-2 px-3 py-3">
        {#each timersStore.notes as note (note.id)}
          <!-- Тап по строке — страница заметки (там снимают/переносят таймер) -->
          <button
            type="button"
            class="glass-card flex w-full touch-manipulation select-none flex-col gap-1 rounded-2xl px-4 py-3 text-left shadow-sm transition-[background-color,transform] active:scale-[0.98] [-webkit-touch-callout:none]"
            onclick={() => (selectedId = note.id)}
          >
            <span class="flex min-w-0 items-start gap-2.5">
              {#if note.done}
                <span class="w-5 shrink-0 text-center text-sm leading-6">✅</span>
              {:else if note.priority !== 'none'}
                <span class="w-5 shrink-0 text-center text-sm leading-6">
                  {priorityEmoji(note.priority)}
                </span>
              {/if}
              <span
                class="line-clamp-2 min-w-0 flex-1 break-words text-[15px] leading-6 {note.done
                  ? 'text-muted line-through'
                  : 'text-content'}"
              >
                {@html firstLineHtml(note.text, note.entities)}
              </span>
            </span>
            <span class="pl-7 text-xs text-muted">
              ⏰ {formatReminderAt(note.reminder_at!, note.reminder_repeat)}
              {note.reminder_repeat === 'daily' ? '· 🔁 ежедневно' : '· 🔂 один раз'}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </main>
</div>

{#if selectedCache !== null}
  <NotePage note={selectedCache} onClose={closePage} />
{/if}
