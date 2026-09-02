<script lang="ts">
  // Карточка заметки: превью первой строки (с форматированием), слева — 📌 или эмодзи приоритета.
  // Справа — ⏰ при установленном напоминании. Выполненная — зачёркнута и приглушена.
  // Клик — открыть оверлей; долгий тач (или правый клик на десктопе) — дропдаун-меню действий.
  import type { Note } from '../types/api';
  import { suppressNextClick } from '../utils/click';
  import { firstLineHtml, formatReminderAt } from '../utils/format';

  let {
    note,
    onOpen,
    onMenu,
    highlighted = false,
  }: {
    note: Note;
    onOpen: (note: Note) => void;
    onMenu?: (note: Note, rect: DOMRect) => void;
    /** Только что добавленная заметка — подсветка на пару секунд. */
    highlighted?: boolean;
  } = $props();

  const marker = $derived(
    note.pinned
      ? '📌'
      : note.priority === 'high'
        ? '🔴'
        : note.priority === 'medium'
          ? '🟡'
          : note.priority === 'low'
            ? '🔵'
            : null,
  );

  const reminder = $derived(
    note.reminder_at !== null ? formatReminderAt(note.reminder_at, note.reminder_repeat) : null,
  );

  // ── Долгий тач ──────────────────────────────────────────────
  // Удержание 300 мс без движения >10px открывает меню и подавляет
  // следующий клик (иначе вместе с меню откроется и оверлей).
  const LONG_PRESS_MS = 300;
  const MOVE_THRESHOLD = 10;

  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressTriggered = false;
  let startX = 0;
  let startY = 0;

  function clearPressTimer(): void {
    if (pressTimer !== null) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    // Мобильный браузер при удержании пальца начинает выделять текст —
    // сбрасываем выделение и фокус, чтобы долгий тап не выделял контент.
    window.getSelection()?.removeAllRanges();
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
    // Элемент захватываем сразу: внутри setTimeout у события currentTarget уже null.
    const el = e.currentTarget as HTMLElement;
    startX = e.clientX;
    startY = e.clientY;
    longPressTriggered = false;
    clearPressTimer();
    pressTimer = setTimeout(() => {
      pressTimer = null;
      longPressTriggered = true;
      suppressNextClick();
      onMenu?.(note, el.getBoundingClientRect());
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: PointerEvent): void {
    if (pressTimer === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
      clearPressTimer();
    }
  }

  function onPointerUp(): void {
    clearPressTimer();
    if (longPressTriggered) {
      // iOS после долгого тапа может оставить выделение — снимаем его.
      window.getSelection()?.removeAllRanges();
    }
  }

  function onPointerCancel(): void {
    clearPressTimer();
  }

  function onCardClick(): void {
    if (longPressTriggered) {
      // Клик после долгого тача: меню уже открыто, оверлей не показываем.
      longPressTriggered = false;
      return;
    }
    onOpen(note);
  }

  // Android Chrome генерирует contextmenu при долгом таче; на десктопе
  // правый клик открывает то же меню.
  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    if (longPressTriggered) return;
    onMenu?.(note, (e.currentTarget as HTMLElement).getBoundingClientRect());
  }
</script>

<button
  type="button"
  class="glass-card flex w-full touch-manipulation select-none items-start gap-2.5 rounded-2xl px-4 py-3 text-left shadow-sm transition-[background-color,transform] active:scale-[0.98] [-webkit-touch-callout:none] {highlighted
    ? 'note-highlight'
    : ''}"
  onclick={onCardClick}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  oncontextmenu={onContextMenu}
>
  {#if marker !== null}
    <span class="w-5 shrink-0 text-center text-sm leading-6">{marker}</span>
  {/if}
  <span
    class="line-clamp-2 min-w-0 flex-1 break-words text-[15px] leading-6 [&_a]:text-accent [&_a]:underline {note.done
      ? 'text-muted line-through'
      : 'text-content'}"
    title={note.text.replace(/\s+/g, ' ')}
  >
    {@html firstLineHtml(note.text, note.entities)}
  </span>
  {#if reminder !== null}
    <span class="shrink-0 text-sm leading-6" title={`⏰ ${reminder}`}>⏰</span>
  {/if}
</button>
