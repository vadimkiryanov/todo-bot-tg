<script lang="ts">
  // Дропдаун-меню действий заметки (долгий тач по карточке / правый клик).
  // Позиционируется fixed под карточкой; если снизу мало места — над ней.
  // Закрывается по тапу вне, скроллу или Escape.
  import { onMount } from 'svelte';
  import ConfirmModal from './ConfirmModal.svelte';
  import {
    archiveNote,
    removeNote,
    removeArchivedNote,
    setPriority,
    toggleDone,
    togglePin,
    unarchiveNote,
  } from '../stores/notes.svelte';
  import type { Note } from '../types/api';
  import { ui } from '../stores/ui.svelte';
  import { nextPriority, priorityEmoji, priorityLabel } from '../utils/format';

  let {
    note,
    rect,
    archived = false,
    onClose,
  }: {
    note: Note;
    rect: DOMRect;
    archived?: boolean;
    onClose: () => void;
  } = $props();

  let busy = $state(false);
  let error = $state('');
  let confirmDelete = $state(false);
  // Приоритет остаётся открытым: busy только на своей кнопке (без общего мигания).
  let priorityBusy = $state(false);

  // Позиция: под карточкой; если меню выше доступного места снизу — над ней.
  let menuEl: HTMLDivElement | undefined = $state();
  let openUp = $state(false);
  const pos = $derived.by(() => {
    const width = Math.min(Math.max(rect.width, 240), 336);
    return {
      width,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: rect.bottom + 6,
      bottom: Math.max(8, window.innerHeight - rect.top + 6),
    };
  });

  $effect(() => {
    if (menuEl) {
      const below = window.innerHeight - rect.bottom - 6;
      openUp = menuEl.offsetHeight > below;
    }
  });

  onMount(() => {
    const onScroll = () => onClose();
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKeydown);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKeydown);
    };
  });

  /** Выполнить действие, закрыть меню; при ошибке — показать в меню. */
  async function run(action: () => Promise<void>): Promise<void> {
    busy = true;
    error = '';
    try {
      await action();
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      busy = false;
    }
  }

  /**
   * Циклическое переключение приоритета (как в боте). Меню НЕ закрывается —
   * можно кликать несколько раз подряд и видеть, как статус меняется.
   */
  async function doCyclePriority(): Promise<void> {
    if (priorityBusy) return;
    priorityBusy = true;
    error = '';
    try {
      await setPriority(note, nextPriority(note.priority));
    } catch (e) {
      error = e instanceof Error ? e.message : 'ошибка';
    } finally {
      priorityBusy = false;
    }
  }
</script>

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
    onConfirm={() => run(archived ? () => removeArchivedNote(note) : () => removeNote(note))}
  />
{:else}
  <!-- Затемнённый фон: тап по нему — закрыть меню -->
  <div class="backdrop-anim fixed inset-0 z-40 bg-black/40" onclick={onClose} aria-hidden="true"></div>

  <div
    bind:this={menuEl}
    class="menu-anim fixed z-50 flex flex-col gap-1 rounded-2xl border border-border bg-surface p-2 shadow-xl"
    style:left={`${pos.left}px`}
    style:width={`${pos.width}px`}
    style:top={openUp ? undefined : `${pos.top}px`}
    style:bottom={openUp ? `${pos.bottom}px` : undefined}
    role="menu"
  >
    {#if error}
      <p class="px-3 py-1 text-xs text-danger">{error}</p>
    {/if}

    {#if !archived}
      <button
        type="button"
        role="menuitem"
        class="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left transition-colors active:bg-border/50"
        onclick={() => {
          ui.folderCreateOpen = true;
          onClose();
        }}
      >
        <span class="w-6 shrink-0 text-center text-base">📁</span>
        Создать папку
      </button>
    {/if}

    <button
      type="button"
      role="menuitem"
      class="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left transition-colors active:bg-border/50"
      disabled={busy}
      onclick={() => run(() => toggleDone(note))}
    >
      <span class="w-6 shrink-0 text-center text-base">{note.done ? '↩️' : '✅'}</span>
      {note.done ? 'Вернуть' : 'Выполнить'}
    </button>

    {#if archived}
      <button
        type="button"
        role="menuitem"
        class="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left transition-colors active:bg-border/50"
        disabled={busy}
        onclick={() => run(() => unarchiveNote(note))}
      >
        <span class="w-6 shrink-0 text-center text-base">↩️</span>
        Вернуть из архива
      </button>
    {:else}
      <button
        type="button"
        role="menuitem"
        class="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left transition-colors active:bg-border/50"
        disabled={priorityBusy}
        onclick={() => void doCyclePriority()}
      >
        <span class="w-6 shrink-0 text-center text-base">{priorityEmoji(note.priority)}</span>
        Приоритет: {priorityLabel(note.priority)}
      </button>

      <button
        type="button"
        role="menuitem"
        class="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left transition-colors active:bg-border/50"
        disabled={busy}
        onclick={() => run(() => togglePin(note))}
      >
        <span class="w-6 shrink-0 text-center text-base">📌</span>
        {note.pinned ? 'Открепить' : 'Закрепить'}
      </button>

      <button
        type="button"
        role="menuitem"
        class="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left transition-colors active:bg-border/50"
        disabled={busy}
        onclick={() => run(() => archiveNote(note))}
      >
        <span class="w-6 shrink-0 text-center text-base">🗄</span>
        В архив
      </button>
    {/if}

    <button
      type="button"
      role="menuitem"
      class="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left text-danger transition-colors active:bg-border/50"
      onclick={() => {
        confirmDelete = true;
        error = '';
      }}
    >
      <span class="w-6 shrink-0 text-center text-base">🗑</span>
      Удалить
    </button>
  </div>
{/if}
