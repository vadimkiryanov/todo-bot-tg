<script lang="ts">
  // Экран «🔔 Уведомления» (URL /notifications): журнал сработавших напоминаний
  // (серверный). Открытие экрана помечает всё прочитанным; тап по записи —
  // открывает заметку «страницей» (если она ещё существует).
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import NotePage from '$lib/components/NotePage.svelte';
  import { getNote } from '$lib/api/notes';
  import { loadNotifications, markAllRead, notificationsStore } from '$lib/stores/notifications.svelte';
  import { logout } from '$lib/stores/session.svelte';
  import type { Note } from '$lib/types/api';
  import { firstLineHtml, formatFiredAt } from '$lib/utils/format';

  // Открытая заметка (по id из уведомления) — объект подгружается с сервера,
  // если её нет в загруженных списках (owner-aware мутации в NotePage).
  let openedNote: Note | null = $state(null);
  let openError = $state('');

  onMount(() => {
    // Экран открыт — загружаем журнал и помечаем всё прочитанным.
    void loadNotifications().then(() => markAllRead());
  });

  async function openByNotification(noteId: number): Promise<void> {
    if (openError !== '') openError = '';
    try {
      openedNote = await getNote(noteId);
    } catch {
      // Заметка удалена после срабатывания — показываем текст снапшота как есть.
      openError = 'заметка удалена';
    }
  }

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
    <span class="text-xl">🔔</span>
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
    {#if notificationsStore.loading && notificationsStore.items.length === 0}
      <EmptyState emoji="⏳" />
    {:else if notificationsStore.error && notificationsStore.items.length === 0}
      <div class="flex flex-col items-center gap-4 px-6 py-16">
        <EmptyState emoji="⚠️" text={notificationsStore.error} />
        <button
          type="button"
          class="h-11 rounded-xl border border-border px-6 text-sm"
          onclick={() => void loadNotifications()}
        >
          Повторить
        </button>
      </div>
    {:else if notificationsStore.items.length === 0}
      <EmptyState emoji="🔕" text="Уведомлений нет" />
    {:else}
      <div class="flex flex-col gap-2 px-3 py-3">
        {#if openError !== ''}
          <p class="px-2 text-sm text-danger">{openError}</p>
        {/if}
        {#each notificationsStore.items as item (item.id)}
          <!-- Непрочитанные визуально выделены точкой у 🔔 -->
          <button
            type="button"
            class="glass-card flex w-full touch-manipulation select-none flex-col gap-1 rounded-2xl px-4 py-3 text-left shadow-sm transition-[background-color,transform] active:scale-[0.98] [-webkit-touch-callout:none]"
            onclick={() => void openByNotification(item.note_id)}
          >
            <span class="flex min-w-0 items-start gap-2.5">
              <span class="relative w-5 shrink-0 text-center text-sm leading-6">
                🔔
                {#if !item.read}
                  <span
                    class="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-accent"
                    aria-label="Непрочитано"
                  ></span>
                {/if}
              </span>
              <span
                class="line-clamp-3 min-w-0 flex-1 break-words text-[15px] leading-6 {item.read
                  ? 'text-muted'
                  : 'text-content'}"
              >
                {@html firstLineHtml(item.text, [])}
              </span>
            </span>
            <span class="pl-7 text-xs text-muted">⏰ {formatFiredAt(item.fired_at)}</span>
          </button>
        {/each}
      </div>
    {/if}
  </main>
</div>

{#if openedNote !== null}
  <NotePage
    note={openedNote}
    onClose={() => {
      openedNote = null;
    }}
  />
{/if}
