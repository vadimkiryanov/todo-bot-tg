// Строка заметки для списков на компонентах @telegram-apps/telegram-ui:
// списки архива/выполненных, список заметок чата, результаты поиска.
// Строка живёт внутри карточки-секции и показывает то же, что показывала
// стеклянная карточка: превью с форматированием (обрезка по высоте, по
// желанию — целиком), метка «пин» у закреплённой, приоритет цветной обводкой,
// выполненная зачёркнута и приглушена. Мету (напоминание с колокольчиком и
// дату правки), которая в карточке висела по краям, строка показывает
// подписью — так делает Telegram. Клик — оверлей заметки, долгий тач
// (правый клик) — меню действий.
import type { ReactNode } from 'react';
import { Cell } from '@telegram-apps/telegram-ui';
import { Icon24Notifications } from '@telegram-apps/telegram-ui/dist/icons/24/notifications';

import type { Note } from '../types/api';
import { useNoteViewStore } from '../stores/noteView';
import { previewBlocksHtml, renderNoteBlocksHtml } from '../utils/blocks';
import { formatEditedAt, formatReminderAt } from '../utils/format';
import { useLongPress } from '../utils/longPress';

interface NoteCellProps {
  note: Note;
  onOpen: (note: Note) => void;
  onMenu?: (note: Note, rect: DOMRect) => void;
  /** Только что добавленная заметка — подсветка на пару секунд. */
  highlighted?: boolean;
}

export function NoteCell({ note, onOpen, onMenu, highlighted = false }: NoteCellProps) {
  // Полное отображение этой заметки (локальная настройка устройства).
  const expanded = useNoteViewStore((s) => s.expanded.has(note.id));

  const press = useLongPress(
    onMenu === undefined
      ? undefined
      : (el) => {
          onMenu(note, el.getBoundingClientRect());
        },
  );

  const prioCls =
    note.priority === 'high'
      ? 'note-priority-high'
      : note.priority === 'medium'
        ? 'note-priority-medium'
        : note.priority === 'low'
          ? 'note-priority-low'
          : '';

  const reminder =
    note.reminder_at !== null ? formatReminderAt(note.reminder_at, note.reminder_repeat) : '';
  const editedAt = formatEditedAt(note.updated_at);
  // Подпись строки: напоминание помечаем колокольчиком из набора библиотеки
  // (иконки часов в нём нет), дата правки — текстом; части разделяет «·».
  const meta: ReactNode =
    reminder === '' ? (
      editedAt
    ) : (
      <>
        <Icon24Notifications className="mr-1 inline h-4 w-4 align-middle" />
        {`${reminder} · ${editedAt}`}
      </>
    );

  // w-full обязателен: <button> в Chromium не растягивается как блочный бокс,
  // а схлопывается по содержимому — короткая строка не заняла бы карточку, и
  // обводка приоритета с областью тапа оказались бы уже карточки.
  return (
    <Cell
      Component="button"
      type="button"
      multiline
      className={`w-full touch-pan-y select-none text-left btn-press-soft [-webkit-touch-callout:none]${highlighted ? ' note-highlight' : ''}${prioCls !== '' ? ` ${prioCls}` : ''}`}
      after={
        note.pinned ? (
          /* Иконки закрепления в наборе библиотеки нет — метка словом
             (как «папка» у строк папок). */
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">пин</span>
        ) : undefined
      }
      subtitle={meta === '' ? undefined : meta}
      onClick={() => {
        if (press.skipClick()) return;
        onOpen(note);
      }}
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onContextMenu={press.onContextMenu}
    >
      <span
        className={`note-preview block min-w-0 break-words text-[15px] leading-6 [&_a]:text-primary [&_a]:underline ${
          expanded ? 'note-preview-full' : 'overflow-hidden'
        } ${note.done ? 'note-done' : ''}`}
        title={note.text.replace(/\s+/g, ' ')}
        dangerouslySetInnerHTML={{
          __html: expanded
            ? renderNoteBlocksHtml(note.text, note.entities, false)
            : previewBlocksHtml(note.text, note.entities),
        }}
      />
    </Cell>
  );
}
