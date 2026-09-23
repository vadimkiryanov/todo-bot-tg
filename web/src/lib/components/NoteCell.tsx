// Строка заметки для списков на компонентах @telegram-apps/telegram-ui:
// списки архива/выполненных, список заметок чата, результаты поиска.
// Строка живёт внутри карточки-секции и показывает то же, что показывала
// стеклянная карточка: превью с форматированием (обрезка по высоте, по
// желанию — целиком), приоритет цветной обводкой по контуру, выполненная
// зачёркнута и приглушена. Закрепление — контурной иконкой пина сверху справа,
// у первой строки текста (текстовой метки «пин» больше нет). Подпись строки,
// как в Telegram: слева напоминание с колокольчиком, справа — дата правки.
// Клик — оверлей заметки, долгий тач (правый клик) — меню действий.
import { Cell } from '@telegram-apps/telegram-ui';
import { Icon24Notifications } from '@telegram-apps/telegram-ui/dist/icons/24/notifications';

import type { Note } from '../types/api';
import { useNoteViewStore } from '../stores/noteView';
import { previewBlocksHtml, renderNoteBlocksHtml } from '../utils/blocks';
import { formatEditedAt, formatReminderAt } from '../utils/format';
import { useLongPress } from '../utils/longPress';
import { useRowSwing, type RowPhase } from '../utils/rowSwing';

import { PinIcon } from './PinIcon';

interface NoteCellProps {
  note: Note;
  onOpen: (note: Note) => void;
  onMenu?: (note: Note, rect: DOMRect) => void;
  /** Только что добавленная заметка — подсветка на пару секунд. */
  highlighted?: boolean;
  /** Строка появляется/уходит: её высота едет, соседи пододвигаются. */
  phase?: RowPhase;
  /** Строка доиграла появление/уход — анимация строки завершена. */
  onSettled?: () => void;
}

export function NoteCell({
  note,
  onOpen,
  onMenu,
  highlighted = false,
  phase = 'idle',
  onSettled,
}: NoteCellProps) {
  // Полное отображение этой заметки (локальная настройка устройства).
  const expanded = useNoteViewStore((s) => s.expanded.has(note.id));

  // Анимация высоты строки при появлении/уходе (см. utils/rowSwing).
  const swing = useRowSwing(phase, onSettled);

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
  // (иконки часов в нём нет) и держим слева, дата правки — справа. viewBox:
  // у иконок набора его нет, без него уменьшение размера не масштабирует
  // рисунок, а режет его по краю бокса (колокольчик терял низ с язычком).
  const subtitle = (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 truncate">
        {reminder !== '' && (
          <>
            <Icon24Notifications
              viewBox="0 0 24 24"
              className="mr-1 inline h-4 w-4 align-[-2px]"
            />
            {reminder}
          </>
        )}
      </span>
      <span className="ml-auto shrink-0">{editedAt}</span>
    </span>
  );

  // w-full обязателен: <button> в Chromium не растягивается как блочный бокс,
  // а схлопывается по содержимому — короткая строка не заняла бы карточку, и
  // обводка приоритета с областью тапа оказались бы уже карточки.
  return (
    <Cell
      ref={swing.ref}
      style={swing.style}
      Component="button"
      type="button"
      multiline
      className={`w-full touch-pan-y select-none text-left btn-press-soft [-webkit-touch-callout:none]${highlighted ? ' note-highlight' : ''}${prioCls !== '' ? ` ${prioCls}` : ''}`}
      titleBadge={
        note.pinned ? (
          /* ml-auto держит пин у правого края при любой длине текста,
             self-start — у первой строки. */
          <span className="ml-auto mt-[3px] shrink-0 self-start text-muted-foreground">
            <PinIcon />
          </span>
        ) : undefined
      }
      subtitle={subtitle}
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
