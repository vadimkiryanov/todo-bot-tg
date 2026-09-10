// Карточка заметки: превью первой строки (с форматированием), слева — 📌 у
// закреплённой. Приоритет показывается цветной обводкой карточки
// (note-priority-*), не эмодзи-кружком. Справа — ⏰ при установленном
// напоминании. Едва заметно в правом нижнем углу — дата редактирования
// (вне потока, места не занимает). Для отдельной заметки можно включить
// полное отображение (без обрезки превью) — ⋮ внутри заметки / меню карточки.
// Выполненная — зачёркнута и приглушена.
// Клик — открыть оверлей; долгий тач (или правый клик на десктопе) — дропдаун-меню действий.
import { useEffect, useRef } from 'react';
import type * as React from 'react';

import type { Note } from '../types/api';
import { useNoteViewStore } from '../stores/noteView';
import { previewBlocksHtml, renderNoteBlocksHtml } from '../utils/blocks';
import { suppressNextClick } from '../utils/click';
import { formatEditedAt, formatReminderAt } from '../utils/format';

interface NoteCardProps {
  note: Note;
  onOpen: (note: Note) => void;
  onMenu?: (note: Note, rect: DOMRect) => void;
  /** Только что добавленная заметка — подсветка на пару секунд. */
  highlighted?: boolean;
}

export function NoteCard({ note, onOpen, onMenu, highlighted = false }: NoteCardProps) {
  // Полное отображение этой заметки (локальная настройка устройства).
  const expanded = useNoteViewStore((s) => s.expanded.has(note.id));

  const prioCls =
    note.priority === 'high'
      ? 'note-priority-high'
      : note.priority === 'medium'
        ? 'note-priority-medium'
        : note.priority === 'low'
          ? 'note-priority-low'
          : '';

  const reminder =
    note.reminder_at !== null ? formatReminderAt(note.reminder_at, note.reminder_repeat) : null;

  const editedAt = formatEditedAt(note.updated_at);

  // ── Долгий тач ──────────────────────────────────────────────
  // Удержание 300 мс без движения >10px открывает меню и подавляет
  // следующий клик (иначе вместе с меню откроется и оверлей).
  const LONG_PRESS_MS = 300;
  const MOVE_THRESHOLD = 10;

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);

  function clearPressTimer(): void {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  // Горизонтальный свайп раскладывает список в «сцену» — карточка под пальцем
  // размонтируется (и пересоздаётся в панели сцены). Её таймер долгого нажатия
  // иначе дожил бы до конца и открыл меню посреди свайпа: обработчики
  // pointermove на размонтированном элементе уже не вызываются, движение
  // таймер не сбрасывает. Гасим таймер вместе с жизнью карточки; на случай
  // гонки (таймер уже в очереди) проверяем, что карточка ещё в документе.
  useEffect(
    () => () => {
      clearPressTimer();
    },
    [],
  );

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>): void {
    if (e.button !== 0) return;
    // Мобильный браузер при удержании пальца начинает выделять текст —
    // сбрасываем выделение и фокус, чтобы долгий тап не выделял контент.
    window.getSelection()?.removeAllRanges();
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
    // Элемент захватываем сразу: внутри setTimeout у события currentTarget уже null.
    const el = e.currentTarget;
    startX.current = e.clientX;
    startY.current = e.clientY;
    longPressTriggered.current = false;
    clearPressTimer();
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      // Карточку размонтировали (свайп собрал сцену, список сменился) — меню
      // не открываем: таймер мог сработать раньше, чем unmount-очистка его сняла.
      if (!el.isConnected) return;
      longPressTriggered.current = true;
      suppressNextClick();
      onMenu?.(note, el.getBoundingClientRect());
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>): void {
    if (pressTimer.current === null) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
      clearPressTimer();
    }
  }

  function onPointerUp(): void {
    clearPressTimer();
    if (longPressTriggered.current) {
      // iOS после долгого тапа может оставить выделение — снимаем его.
      window.getSelection()?.removeAllRanges();
    }
  }

  function onPointerCancel(): void {
    clearPressTimer();
  }

  function onCardClick(): void {
    if (longPressTriggered.current) {
      // Клик после долгого тача: меню уже открыто, оверлей не показываем.
      longPressTriggered.current = false;
      return;
    }
    onOpen(note);
  }

  // Android Chrome генерирует contextmenu при долгом таче; на десктопе
  // правый клик открывает то же меню.
  function onContextMenu(e: React.MouseEvent<HTMLButtonElement>): void {
    e.preventDefault();
    if (longPressTriggered.current) return;
    onMenu?.(note, e.currentTarget.getBoundingClientRect());
  }

  return (
    <button
      type="button"
      className={`glass-card relative flex w-full touch-pan-y select-none items-start gap-2.5 rounded-2xl px-4 py-3 text-left shadow-sm transition-[background-color,transform] active:scale-[0.98] [-webkit-touch-callout:none]${highlighted ? ' note-highlight' : ''}${prioCls !== '' ? ` ${prioCls}` : ''}`}
      onClick={onCardClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
    >
      {note.pinned && (
        <span className="w-5 shrink-0 text-center text-sm leading-6">📌</span>
      )}
      {/* Блочное превью: первые строки с форматированием (# заголовок,
          список, чеклист). В режиме полного отображения заметка рендерится
          целиком (note-preview-full снимает обрезку по высоте). Выполненная —
          зачёркивается и приглушается классом note-done (line-through на
          контейнере сквозь блочные div не проходит — стилизуются сами строки,
          см. app.css). */}
      <div
        className={`note-preview min-w-0 flex-1 break-words text-[15px] leading-6 [&_a]:text-primary [&_a]:underline ${
          expanded ? 'note-preview-full' : 'overflow-hidden'
        } ${note.done ? 'note-done' : ''}`}
        title={note.text.replace(/\s+/g, ' ')}
        dangerouslySetInnerHTML={{
          __html: expanded
            ? renderNoteBlocksHtml(note.text, note.entities, false)
            : previewBlocksHtml(note.text, note.entities),
        }}
      />
      {reminder !== null && (
        <span className="shrink-0 text-sm leading-6" title={`⏰ ${reminder}`}>
          ⏰
        </span>
      )}
      {/* Дата редактирования — вне потока (absolute), поэтому места не
          занимает; лежит в нижнем поле карточки (py-3), текста не касается. */}
      {editedAt !== '' && (
        <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] leading-none text-muted-foreground/50">
          {editedAt}
        </span>
      )}
    </button>
  );
}
