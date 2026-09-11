// Дропдаун-меню действий заметки (долгий тач по карточке / правый клик).
// Позиционируется fixed под карточкой; если снизу мало места — над ней.
// Закрывается по тапу вне или Escape; пока меню открыто, скролл списка
// заморожен (уход пальца/скролл-жест не прячет меню и не скроллит список).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type * as React from 'react';

import { ConfirmModal } from './ConfirmModal';
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
import { lockScroll, unlockScroll } from '../utils/scroll';
import { nextPriority, priorityEmoji, priorityLabel } from '../utils/format';

interface NoteMenuProps {
  note: Note;
  rect: DOMRect;
  archived?: boolean;
  done?: boolean;
  onClose: () => void;
  /** Открыть модалку перемещения (пункт «📂 Переместить»; только активные). */
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    lockScroll();
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeydown);
    return () => {
      unlockScroll();
      window.removeEventListener('keydown', onKeydown);
    };
  }, []);

  /** Выполнить действие, закрыть меню; при ошибке — показать в меню. */
  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await action();
      onCloseRef.current();
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
        className="backdrop-glass backdrop-anim fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      ></div>

      <div
        ref={menuEl}
        className="glass-menu menu-anim fixed z-50 flex flex-col gap-1 overflow-y-auto rounded-2xl p-2 shadow-xl"
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

        {!archived && !done && (
          <button
            type="button"
            role="menuitem"
            className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left btn-press-soft transition-colors active:bg-border/50"
            onClick={() => {
              useUiStore.setState({ folderCreateOpen: true });
              onClose();
            }}
          >
            <span className="w-6 shrink-0 text-center text-base">📁</span>
            Создать папку
          </button>
        )}

        {!done && (
          <button
            type="button"
            role="menuitem"
            className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left btn-press-soft transition-colors active:bg-border/50"
            disabled={busy}
            onClick={() => {
              void run(() => toggleDone(note));
            }}
          >
            <span className="w-6 shrink-0 text-center text-base">{note.done ? '↩️' : '✅'}</span>
            {note.done ? 'Вернуть' : 'Выполнить'}
          </button>
        )}

        {archived ? (
          <button
            type="button"
            role="menuitem"
            className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left btn-press-soft transition-colors active:bg-border/50"
            disabled={busy}
            onClick={() => {
              void run(() => unarchiveNote(note));
            }}
          >
            <span className="w-6 shrink-0 text-center text-base">↩️</span>
            Вернуть из архива
          </button>
        ) : done ? (
          <button
            type="button"
            role="menuitem"
            className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left btn-press-soft transition-colors active:bg-border/50"
            disabled={busy}
            onClick={() => {
              void run(() => undoneNote(note));
            }}
          >
            <span className="w-6 shrink-0 text-center text-base">↩️</span>
            Вернуть в работу
          </button>
        ) : (
          <>
            <button
              type="button"
              role="menuitem"
              className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left btn-press-soft transition-colors active:bg-border/50"
              disabled={priorityBusy}
              onClick={() => {
                void doCyclePriority();
              }}
            >
              <span className="w-6 shrink-0 text-center text-base">
                {priorityEmoji(priority)}
              </span>
              Приоритет: {priorityLabel(priority)}
            </button>

            <button
              type="button"
              role="menuitem"
              className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left btn-press-soft transition-colors active:bg-border/50"
              disabled={busy}
              onClick={() => {
                void run(() => togglePin(note));
              }}
            >
              <span className="w-6 shrink-0 text-center text-base">📌</span>
              {note.pinned ? 'Открепить' : 'Закрепить'}
            </button>

            {onMove !== undefined && (
              <button
                type="button"
                role="menuitem"
                className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left btn-press-soft transition-colors active:bg-border/50"
                onClick={() => {
                  // Сначала действие с валидной заметкой; закрытие — после. Если
                  // закрыть меню раньше, заметка родителя к моменту onMove уже
                  // была бы сброшена.
                  onMove(note);
                  onClose();
                }}
              >
                <span className="w-6 shrink-0 text-center text-base">📂</span>
                Переместить
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left btn-press-soft transition-colors active:bg-border/50"
              disabled={busy}
              onClick={() => {
                void run(() => archiveNote(note));
              }}
            >
              <span className="w-6 shrink-0 text-center text-base">🗄</span>
              В архив
            </button>
          </>
        )}

        {/* Полное отображение заметки на карточке — переключатель доступен в
            любом состоянии. После тапа меню закрываем: результат (заметка
            разворачивается на карточке) должен быть виден сразу. */}
        <button
          type="button"
          role="menuitem"
          className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left btn-press-soft transition-colors active:bg-border/50"
          onClick={() => {
            toggleNoteExpanded(note.id);
            onClose();
          }}
        >
          <span className="w-6 shrink-0 text-center text-base">{expanded ? '⤡' : '⤢'}</span>
          {expanded ? 'Свернуть' : 'Развернуть'}
        </button>

        <button
          type="button"
          role="menuitem"
          className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-left text-destructive btn-press-soft transition-colors active:bg-border/50"
          onClick={() => {
            setConfirmDelete(true);
            setError('');
          }}
        >
          <span className="w-6 shrink-0 text-center text-base">🗑</span>
          Удалить
        </button>
      </div>
    </>
  );
}
