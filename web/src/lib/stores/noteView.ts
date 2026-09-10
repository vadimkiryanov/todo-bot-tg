// Режим полного отображения заметки (локальный, для устройства).
//   Обычно карточка заметки показывает превью — обрезанные ~2 строки текста
//   (`.note-preview`). Режим полного отображения выключает обрезку: заметка
//   рендерится на карточке целиком, со всем форматированием.
//   Включается поштучно, для каждой заметки отдельно: изнутри заметки
//   (⋯ → «⤢ Развернуть») и из контекстного меню карточки (долгий тап).
// Отметки хранятся в localStorage и переживают перезагрузку страницы.
// Настройка локальна для устройства и не синхронизируется с ботом.
import { create } from 'zustand';

const EXPANDED_KEY = 'todo.expandedNotes';

/** Отметки «развёрнуто» из localStorage (битые данные — пустое множество). */
function readExpanded(): Set<number> {
  // В node (тесты) localStorage отсутствует — режим не сохраняется.
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is number => typeof id === 'number'));
  } catch {
    return new Set();
  }
}

function writeExpanded(ids: Set<number>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage недоступен — режим живёт до перезагрузки страницы
  }
}

interface NoteViewState {
  /** ID заметок, показываемых на карточке целиком. */
  expanded: Set<number>;
}

export const useNoteViewStore = create<NoteViewState>()(() => ({
  expanded: readExpanded(),
}));

/** Развёрнута ли заметка (полное отображение на карточке). */
export function isNoteExpanded(noteId: number): boolean {
  return useNoteViewStore.getState().expanded.has(noteId);
}

/** Переключить режим полного отображения для одной заметки. */
export function toggleNoteExpanded(noteId: number): void {
  const current = useNoteViewStore.getState().expanded;
  const next = new Set(current);
  if (next.has(noteId)) {
    next.delete(noteId);
  } else {
    next.add(noteId);
  }
  useNoteViewStore.setState({ expanded: next });
  writeExpanded(next);
}
