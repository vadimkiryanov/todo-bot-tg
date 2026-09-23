// Дропдаун-меню действий заметки (долгий тач по карточке / правый клик).
// Позиционируется fixed под карточкой; если снизу мало места — над ней.
// Закрывается по тапу вне или Escape; пока меню открыто, скролл списка
// заморожен (уход пальца/скролл-жест не прячет меню и не скроллит список).
// Пункты — плоские строки-Cell на компонентах @telegram-apps/telegram-ui
// (MenuRow): своим у меню остаются только «стекло», позиция и анимация.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type * as React from 'react';
import type { ReactNode } from 'react';
import { List, Section } from '@telegram-apps/telegram-ui';
import { Icon16Cancel } from '@telegram-apps/telegram-ui/dist/icons/16/cancel';
import { Icon20Select } from '@telegram-apps/telegram-ui/dist/icons/20/select';
import { Icon24ChevronDown } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_down';
import { Icon24ChevronLeft } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_left';
import { Icon24ChevronRight } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_right';
import { Icon28AddCircle } from '@telegram-apps/telegram-ui/dist/icons/28/add_circle';
import { Icon28Archive } from '@telegram-apps/telegram-ui/dist/icons/28/archive';

import { ConfirmModal } from './ConfirmModal';
import { MenuRow } from './MenuRow';
import { PinIcon } from './PinIcon';
import {
  archiveNote,
  removeArchivedNote,
  removeDoneNote,
  removeNote,
  setPriority,
  toggleDone,
  togglePin,
  unarchiveNote,
  undoneNote,
  useNotesStore,
} from '../stores/notes';
import { toggleNoteExpanded, useNoteViewStore } from '../stores/noteView';
import { useUiStore } from '../stores/ui';
import type { Note } from '../types/api';
import { useCloseAnim } from '../utils/closeAnim';
import { lockScroll, unlockScroll } from '../utils/scroll';
import { nextPriority, priorityLabel, priorityMark } from '../utils/format';

interface NoteMenuProps {
  note: Note;
  rect: DOMRect;
  archived?: boolean;
  done?: boolean;
  onClose: () => void;
  /** Открыть модалку перемещения (пункт «Переместить»; только активные). */
  onMove?: (note: Note) => void;
}

export function NoteMenu({
  note,
  rect,
  archived = false,
  done = false,
  onClose,
  onMove,
}: NoteMenuProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Приоритет остаётся открытым: busy только на своей кнопке (без общего мигания).
  const [priorityBusy, setPriorityBusy] = useState(false);

  // Живой приоритет из списка: меню держит заметку с момента открытия, а после
  // кликов по «Приоритет» она устаревает — подпись показывала бы старое
  // значение. Заметки нет в списках (например, из результатов поиска) —
  // падаем обратно на переданную.
  const storePriority = useNotesStore((s) =>
    [...s.notes, ...s.doneNotes, ...s.archivedNotes, ...s.timersNotes].find(
      (n) => n.id === note.id,
    )?.priority,
  );
  const priority = storePriority ?? note.priority;

  // Режим полного отображения — тоже из стора, чтобы подпись пункта была верной.
  const expanded = useNoteViewStore((s) => s.expanded.has(note.id));

  // Позиция: под карточкой; если меню выше доступного места снизу — над ней.
  const menuEl = useRef<HTMLDivElement | null>(null);
  const [openUp, setOpenUp] = useState(false);
  const MENU_MARGIN = 8;
  const [maxMenuHeight, setMaxMenuHeight] = useState<number | undefined>(undefined);

  // Уход — обратной анимацией: меню «сжимается» на месте, подложка гаснет
  // (раньше меню исчезало рывком, хотя появлялось плавно).
  const { closing, requestClose } = useCloseAnim(onClose);

  const pos = (() => {
    const width = Math.min(Math.max(rect.width, 240), 336);
    return {
      width,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: rect.bottom + 6,
      bottom: Math.max(8, window.innerHeight - rect.top + 6),
    };
  })();

  // Когда пунктов много, меню выше вьюпорта: ограничиваем высоту свободным
  // местом и скроллим внутри. Раскрываем вверх, только если сверху места
  // больше, чем снизу; высоту меряем ДО применения max-height (иначе
  // offsetHeight оказался бы зажат предыдущим ограничением).
  useLayoutEffect(() => {
    const el = menuEl.current;
    if (el === null) return; // меню не отрисовано (открыто подтверждение удаления)
    const below = window.innerHeight - rect.bottom - 6;
    const above = rect.top - 6;
    const natural = el.offsetHeight;
    if (natural <= below) {
      setOpenUp(false);
      setMaxMenuHeight(undefined);
      return;
    }
    if (above > below) {
      setOpenUp(true);
      setMaxMenuHeight(Math.max(MENU_MARGIN, above - MENU_MARGIN));
    } else {
      setOpenUp(false);
      setMaxMenuHeight(Math.max(MENU_MARGIN, below - MENU_MARGIN));
    }
  }, [rect, confirmDelete]);

  // Пока меню открыто — скролл списка заморожен: жест скролла/уход пальца
  // не должен закрывать меню (пользователь сам выберет пункт или закроет).
  // requestClose неизменна, поэтому подписка одна на всё время жизни меню.
  useEffect(() => {
    lockScroll();
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKeydown);
    return () => {
      unlockScroll();
      window.removeEventListener('keydown', onKeydown);
    };
  }, [requestClose]);

  /** Выполнить действие, закрыть меню; при ошибке — показать в меню. */
  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await action();
      requestClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Циклическое переключение приоритета (как в боте). Меню НЕ закрывается —
   * можно кликать несколько раз подряд и видеть, как статус меняется.
   */
  async function doCyclePriority(): Promise<void> {
    if (priorityBusy) return;
    setPriorityBusy(true);
    setError('');
    try {
      await setPriority(note, nextPriority(priority));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка');
    } finally {
      setPriorityBusy(false);
    }
  }

  const confirmTitle = 'Удалить заметку?';
  const confirmText = 'Заметка будет удалена безвозвратно';
  const confirmAction = archived
    ? () => removeArchivedNote(note)
    : done
      ? () => removeDoneNote(note)
      : () => removeNote(note);

  // Пункты — одним массивом, а не условиями «{cond && <MenuRow/>}»: Section
  // расставляет разделители по индексам детей, а ложное условие всё равно
  // занимает слот — между строками встали бы <hr> подряд. В массиве остаются
  // только реально отрисованные строки, поэтому разделители идут через одну.
  const rows: ReactNode[] = [
    ...(!archived && !done
      ? [
          <MenuRow
            key="folder"
            icon={<Icon28AddCircle />}
            onSelect={() => {
              useUiStore.setState({ folderCreateOpen: true });
              requestClose();
            }}
          >
            Создать папку
          </MenuRow>,
        ]
      : []),
    ...(!done
      ? [
          <MenuRow
            key="done"
            // Галочка у «Выполнить», стрелка влево у возврата.
            icon={note.done ? <Icon24ChevronLeft /> : <Icon20Select />}
            disabled={busy}
            onSelect={() => {
              void run(() => toggleDone(note));
            }}
          >
            {note.done ? 'Вернуть' : 'Выполнить'}
          </MenuRow>,
        ]
      : []),
    ...(archived
      ? [
          <MenuRow
            key="unarchive"
            icon={<Icon24ChevronLeft />}
            disabled={busy}
            onSelect={() => {
              void run(() => unarchiveNote(note));
            }}
          >
            Вернуть из архива
          </MenuRow>,
        ]
      : []),
    ...(done
      ? [
          <MenuRow
            key="undone"
            icon={<Icon24ChevronLeft />}
            disabled={busy}
            onSelect={() => {
              void run(() => undoneNote(note));
            }}
          >
            Вернуть в работу
          </MenuRow>,
        ]
      : []),
    ...(!archived && !done
      ? [
          <MenuRow
            key="priority"
            icon={priorityMark(priority)}
            disabled={priorityBusy}
            onSelect={() => {
              void doCyclePriority();
            }}
          >
            Приоритет: {priorityLabel(priority)}
          </MenuRow>,
          <MenuRow
            key="pin"
            icon={<PinIcon className="h-5 w-5" />}
            disabled={busy}
            onSelect={() => {
              void run(() => togglePin(note));
            }}
          >
            {note.pinned ? 'Открепить' : 'Закрепить'}
          </MenuRow>,
          ...(onMove !== undefined
            ? [
                <MenuRow
                  key="move"
                  icon={<Icon24ChevronRight />}
                  onSelect={() => {
                    // Сначала действие с валидной заметкой; закрытие — после.
                    // Если закрыть меню раньше, заметка родителя к моменту
                    // onMove уже была бы сброшена.
                    onMove(note);
                    requestClose();
                  }}
                >
                  Переместить
                </MenuRow>,
              ]
            : []),
          <MenuRow
            key="archive"
            icon={<Icon28Archive />}
            disabled={busy}
            onSelect={() => {
              void run(() => archiveNote(note));
            }}
          >
            В архив
          </MenuRow>,
        ]
      : []),
    // Полное отображение заметки на карточке — переключатель доступен в любом
    // состоянии. После тапа меню закрываем: результат (заметка разворачивается
    // на карточке) должен быть виден сразу.
    <MenuRow
      key="expand"
      icon={<Icon24ChevronDown />}
      onSelect={() => {
        toggleNoteExpanded(note.id);
        requestClose();
      }}
    >
      {expanded ? 'Свернуть' : 'Развернуть'}
    </MenuRow>,
    <MenuRow
      key="delete"
      icon={<Icon16Cancel className="h-5 w-5" />}
      danger
      onSelect={() => {
        setConfirmDelete(true);
        setError('');
      }}
    >
      Удалить
    </MenuRow>,
  ];

  if (confirmDelete) {
    return (
      <ConfirmModal
        title={confirmTitle}
        text={confirmText}
        busy={busy}
        error={error}
        onClose={() => {
          setConfirmDelete(false);
          setError('');
        }}
        onConfirm={() => {
          void run(confirmAction);
        }}
      />
    );
  }

  return (
    <>
      {/* Затемнённый фон: тап по нему — закрыть меню */}
      <div
        className={`backdrop-glass fixed inset-0 z-40 bg-black/40 ${
          closing ? 'backdrop-out' : 'backdrop-anim'
        }`}
        onClick={requestClose}
        aria-hidden="true"
      ></div>

      <div
        ref={menuEl}
        className={`glass-menu fixed z-50 overflow-y-auto rounded-2xl p-2 shadow-xl ${
          closing ? 'menu-out' : 'menu-anim'
        }`}
        style={{
          left: `${pos.left}px`,
          width: `${pos.width}px`,
          top: openUp ? undefined : `${pos.top}px`,
          bottom: openUp ? `${pos.bottom}px` : undefined,
          maxHeight: maxMenuHeight !== undefined ? `${maxMenuHeight}px` : undefined,
        }}
        role="menu"
      >
        {error !== '' && <p className="px-3 py-1 text-xs text-destructive">{error}</p>}

        {/* px-0! py-0! — снимаем собственные отступы List (10px 18px): поля
            меню и отступы строк задаёт карточка-секция. */}
        <List className="px-0! py-0!">
          <Section>{rows}</Section>
        </List>
      </div>
    </>
  );
}

