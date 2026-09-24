// Строка заметки для списков на компонентах @telegram-apps/telegram-ui:
// списки архива/выполненных, список заметок чата, результаты поиска.
// Строка живёт внутри карточки-секции и показывает то же, что показывала
// стеклянная карточка: превью с форматированием (обрезка по высоте, по
// желанию — целиком), приоритет цветной обводкой по контуру, выполненная
// зачёркнута и приглушена. Закрепление — контурной иконкой пина сверху справа,
// у первой строки текста (текстовой метки «пин» больше нет). Подпись строки,
// как в Telegram: слева напоминание с колокольчиком, справа — дата правки.
// Клик — оверлей заметки, долгий тач (правый клик) — меню действий, свайп от
// правого края — полоса кнопок «выполнить»/«закрепить» (utils/rowSwipe).
import type { ReactNode } from 'react';
import { Cell, IconButton } from '@telegram-apps/telegram-ui';
import { Icon20Select } from '@telegram-apps/telegram-ui/dist/icons/20/select';
import { Icon24ChevronLeft } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_left';
import { Icon24Notifications } from '@telegram-apps/telegram-ui/dist/icons/24/notifications';

import type { Note } from '../types/api';
import { toggleDone, togglePin, undoneNote } from '../stores/notes';
import { useNoteViewStore } from '../stores/noteView';
import { previewBlocksHtml, renderNoteBlocksHtml } from '../utils/blocks';
import { formatEditedAt, formatReminderAt } from '../utils/format';
import { useLongPress } from '../utils/longPress';
import { rowSwipeWidth, useRowSwipe } from '../utils/rowSwipe';
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

  // Кнопки полосы, выезжающей из-под правого края строки: те же действия, что
  // в меню (NoteMenu), — «выполнить»/«вернуть» и «закрепить». Выполненная и
  // архивная заметка не закрепляется: mutateNote спрятал бы её из списка,
  // поэтому у такой заметки кнопки пина нет.
  const actions: ReactNode[] = [
    ...(note.done
      ? [
          <IconButton
            key="undone"
            type="button"
            size="m"
            mode="bezeled"
            aria-label="Вернуть в работу"
            title="Вернуть в работу"
            className="h-11 w-11 shrink-0 items-center justify-center rounded-full! p-0! btn-press"
            onClick={() => act(() => undoneNote(note))}
          >
            <Icon24ChevronLeft viewBox="0 0 24 24" className="h-6 w-6" />
          </IconButton>,
        ]
      : [
          <IconButton
            key="done"
            type="button"
            size="m"
            mode="bezeled"
            aria-label="Выполнить"
            title="Выполнить"
            className="h-11 w-11 shrink-0 items-center justify-center rounded-full! p-0! btn-press"
            onClick={() => act(() => toggleDone(note))}
          >
            <Icon20Select viewBox="0 0 20 20" className="h-6 w-6" />
          </IconButton>,
        ]),
    ...(note.done || note.archived
      ? []
      : [
          <IconButton
            key="pin"
            type="button"
            size="m"
            mode={note.pinned ? 'bezeled' : 'gray'}
            aria-label={note.pinned ? 'Открепить' : 'Закрепить'}
            aria-pressed={note.pinned}
            title={note.pinned ? 'Открепить' : 'Закрепить'}
            className="h-11 w-11 shrink-0 items-center justify-center rounded-full! p-0! btn-press"
            onClick={() => act(() => togglePin(note))}
          >
            <PinIcon className="h-6 w-6" />
          </IconButton>,
        ]),
  ];

  // Жест «отодвинуть строку»: зона захвата — правый край строки, лента топиков
  // такой жест не забирает (utils/rowSwipe, startsRowSwipe).
  const swipe = useRowSwipe(rowSwipeWidth(actions.length));

  /** Действие полосы: строку возвращаем и выполняем. Ошибку озвучивает стор
      (noteOpError) — здесь только глушим проброс. */
  function act(action: () => Promise<void>): void {
    swipe.close();
    void action().catch(() => {});
  }

  // w-full обязателен: <button> в Chromium не растягивается как блочный бокс,
  // а схлопывается по содержимому — короткая строка не заняла бы карточку, и
  // обводка приоритета с областью тапа оказались бы уже карточки. Обводка
  // приоритета — на обёртке (её контур совпадает с контуром карточки-секции),
  // обёртка же и обрезает выехавшую полосу кнопок.
  return (
    <div
      ref={swipe.rootRef}
      data-row-swipe={actions.length > 0 ? '1' : undefined}
      className={`relative overflow-hidden touch-pan-y${prioCls !== '' ? ` ${prioCls}` : ''}`}
      onPointerDown={swipe.onPointerDown}
    >
      {/* Слой, который уезжает влево; полоса кнопок лежит сразу за правым
          краем строки (left-full) и выезжает из-под него. rounded-[inherit]
          возвращает скругление карточки-секции: у Cell своего радиуса нет. */}
      <div ref={swipe.slideRef} className="relative rounded-[inherit]">
        <Cell
          ref={swing.ref}
          style={swing.style}
          Component="button"
          type="button"
          multiline
          className={`w-full touch-pan-y select-none rounded-[inherit] text-left btn-press-soft [-webkit-touch-callout:none]${highlighted ? ' note-highlight' : ''}`}
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
            // Полоса действий открыта: тап по строке закрывает её, а не
            // открывает заметку (как в списках iOS).
            if (swipe.opened) {
              swipe.close();
              return;
            }
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

        {actions.length > 0 && (
          <div
            className="absolute inset-y-0 left-full flex items-center gap-2 pl-2"
            style={{ width: `${rowSwipeWidth(actions.length)}px` }}
            aria-hidden={!swipe.opened}
            inert={!swipe.opened}
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
