<script lang="ts">
  // Строка папки в общем списке заметок (режим «в списке»): тап — вход
  // в папку; долгий тач (300 мс, как у карточек заметок) или правый клик
  // на десктопе — контекстное меню папки (FolderMenu: переименовать/удалить).
  import type { Folder } from '../types/api';
  import { suppressNextClick } from '../utils/click';

  let {
    folder,
    onOpen,
    onMenu,
  }: {
    folder: Folder;
    onOpen: (folder: Folder) => void;
    onMenu?: (folder: Folder, rect: DOMRect) => void;
  } = $props();

  // ── Долгий тач ──────────────────────────────────────────────
  // Удержание 300 мс без движения >10px открывает меню и подавляет
  // следующий клик (иначе вместе с меню произойдёт и вход в папку).
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
    // сбрасываем выделение, чтобы долгий тап не выделял соседние элементы.
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
      onMenu?.(folder, el.getBoundingClientRect());
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

  function onRowClick(): void {
    if (longPressTriggered) {
      // Клик после долгого тача: меню уже открыто, в папку не входим.
      longPressTriggered = false;
      return;
    }
    onOpen(folder);
  }

  // Android Chrome генерирует contextmenu при долгом таче; на десктопе
  // правый клик открывает то же меню.
  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    if (longPressTriggered) return;
    onMenu?.(folder, (e.currentTarget as HTMLElement).getBoundingClientRect());
  }
</script>

<button
  type="button"
  class="glass-card flex w-full touch-manipulation select-none items-center gap-2.5 rounded-2xl px-4 py-3 text-left shadow-sm transition-[background-color,transform] active:scale-[0.98] [-webkit-touch-callout:none]"
  onclick={onRowClick}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  oncontextmenu={onContextMenu}
>
  <span class="w-5 shrink-0 text-center text-sm leading-6">📁</span>
  <span class="min-w-0 flex-1 truncate text-[15px] leading-6 text-content">{folder.name}</span>
</button>
