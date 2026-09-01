// Заметки: список активного топика + архив + оптимистичные мутации с откатом.
// Сортировку не дублируем: после мутаций тихо перезагружаем список — сортирует сервер.
import {
  clearReminder as apiClearReminder,
  createNote as apiCreateNote,
  deleteNote as apiDeleteNote,
  listArchivedNotes,
  listNotes,
  moveNote as apiMoveNote,
  setReminder as apiSetReminder,
  updateNote as apiUpdateNote,
  type NotePatch,
} from '../api/notes';
import type { Note, Priority, ReminderRepeat } from '../types/api';
import { navigation } from './navigation.svelte';

export const notesStore = $state<{
  notes: Note[];
  loading: boolean;
  error: string | null;
  /** ID только что созданной заметки — карточка подсвечивается пару секунд. */
  highlightedId: number | null;
}>({
  notes: [],
  loading: false,
  error: null,
  highlightedId: null,
});

/** Архивные заметки (все топики). */
export const archivedStore = $state<{
  notes: Note[];
  loading: boolean;
  error: string | null;
}>({
  notes: [],
  loading: false,
  error: null,
});

/** Загрузка заметок топика. silent — тихая перезагрузка (например, после мутации). */
export async function loadNotes(topicId: number, folderId: number | null = null, silent = false): Promise<void> {
  if (!silent) {
    notesStore.loading = true;
    notesStore.notes = [];
  }
  notesStore.error = null;
  try {
    const notes = await listNotes(topicId, folderId);
    // Защита от гонки: применяем, только если топик не успели переключить.
    if (navigation.activeTopicID === topicId) {
      notesStore.notes = notes;
    }
  } catch (e) {
    notesStore.error = e instanceof Error ? e.message : 'не удалось загрузить заметки';
  } finally {
    if (!silent) {
      notesStore.loading = false;
    }
  }
}

/** Загрузка архива. silent — тихая перезагрузка. */
export async function loadArchived(silent = false): Promise<void> {
  if (!silent) {
    archivedStore.loading = true;
    archivedStore.notes = [];
  }
  archivedStore.error = null;
  try {
    archivedStore.notes = await listArchivedNotes();
  } catch (e) {
    archivedStore.error = e instanceof Error ? e.message : 'не удалось загрузить архив';
  } finally {
    if (!silent) {
      archivedStore.loading = false;
    }
  }
}

/** Опции создания заметки из панели ввода (приоритет, закрепление, напоминание). */
export interface CreateNoteOptions {
  done?: boolean;
  pinned?: boolean;
  priority?: Priority;
  reminder_at?: string; // ISO 8601 (UTC)
  reminder_repeat?: ReminderRepeat;
}

/** Создание заметки в активном топике/папке; после — серверная сортировка. */
export async function createNote(text: string, opts: CreateNoteOptions = {}): Promise<void> {
  const topicId = navigation.activeTopicID;
  if (topicId === null) return;
  const folderId = navigation.activeFolderID;
  const note = await apiCreateNote(topicId, text, folderId, opts);
  notesStore.notes = [...notesStore.notes, note];
  notesStore.highlightedId = note.id;
  await loadNotes(topicId, folderId, true);
}

/** Снять подсветку «только что добавленной» заметки. */
export function clearNoteHighlight(): void {
  notesStore.highlightedId = null;
}

/** Перемещение заметки в папку (folderId null — в корень) активного топика. */
export async function moveNote(note: Note, folderId: number | null): Promise<void> {
  const topicId = navigation.activeTopicID;
  if (topicId === null) return;
  if (note.topic_id === topicId && note.folder_id === folderId) return;
  await apiMoveNote(note.id, topicId, folderId);
  const activeFolder = navigation.activeFolderID;
  if (activeFolder !== folderId) {
    // Заметка покинула текущий список (или пришла в него извне) — перезагружаем.
    await loadNotes(topicId, activeFolder, true);
  }
}

/** Выполнить / вернуть в работу: оптимистично, откат при ошибке. */
export async function toggleDone(note: Note): Promise<void> {
  await mutateNote(note, { done: !note.done });
}

/** Сменить приоритет: оптимистично, откат при ошибке. */
export async function setPriority(note: Note, priority: Priority): Promise<void> {
  if (note.priority === priority) return;
  await mutateNote(note, { priority });
}

/** Закрепить / открепить: оптимистично, откат при ошибке. */
export async function togglePin(note: Note): Promise<void> {
  await mutateNote(note, { pinned: !note.pinned });
}

/** В архив: убрать из активного списка, откат при ошибке. */
export async function archiveNote(note: Note): Promise<void> {
  const previous = notesStore.notes;
  notesStore.notes = previous.filter((n) => n.id !== note.id);
  try {
    await apiUpdateNote(note.id, { archived: true });
  } catch (e) {
    notesStore.notes = previous;
    throw e;
  }
}

/** Вернуть из архива: убрать из архивного списка, откат при ошибке. */
export async function unarchiveNote(note: Note): Promise<void> {
  const previous = archivedStore.notes;
  archivedStore.notes = previous.filter((n) => n.id !== note.id);
  try {
    await apiUpdateNote(note.id, { archived: false });
  } catch (e) {
    archivedStore.notes = previous;
    throw e;
  }
}

/** Сохранить текст (редактирование в оверлее). */
export async function saveText(note: Note, text: string): Promise<void> {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === note.text) return;
  const previous = notesStore.notes;
  const optimistic: Note = { ...note, text: trimmed };
  notesStore.notes = previous.map((n) => (n.id === note.id ? optimistic : n));
  try {
    const fromApi = await apiUpdateNote(note.id, { text: trimmed });
    notesStore.notes = notesStore.notes.map((n) => (n.id === note.id ? fromApi : n));
  } catch (e) {
    notesStore.notes = previous;
    throw e;
  }
}

/** Удалить: оптимистично, откат при ошибке. */
export async function removeNote(note: Note): Promise<void> {
  const previous = notesStore.notes;
  notesStore.notes = previous.filter((n) => n.id !== note.id);
  try {
    await apiDeleteNote(note.id);
  } catch (e) {
    notesStore.notes = previous;
    throw e;
  }
}

/** Удалить из архива: оптимистично, откат при ошибке. */
export async function removeArchivedNote(note: Note): Promise<void> {
  const previous = archivedStore.notes;
  archivedStore.notes = previous.filter((n) => n.id !== note.id);
  try {
    await apiDeleteNote(note.id);
  } catch (e) {
    archivedStore.notes = previous;
    throw e;
  }
}

/** Установить/перенести напоминание: оптимистично, откат при ошибке. */
export async function setReminder(note: Note, at: string, repeat: ReminderRepeat): Promise<void> {
  await mutateReminder(
    note,
    { reminder_at: at, reminder_repeat: repeat },
    () => apiSetReminder(note.id, at, repeat),
  );
}

/** Снять напоминание: оптимистично, откат при ошибке. */
export async function clearReminder(note: Note): Promise<void> {
  await mutateReminder(
    note,
    { reminder_at: null, reminder_repeat: 'once' },
    () => apiClearReminder(note.id),
  );
}

/** Сброс сторов (выход из аккаунта): активные и архивные заметки. */
export function resetNotes(): void {
  notesStore.notes = [];
  notesStore.loading = false;
  notesStore.error = null;
  notesStore.highlightedId = null;
  archivedStore.notes = [];
  archivedStore.loading = false;
  archivedStore.error = null;
}

/** Общая мутация поля (done/priority): применить → сервер → тихая перезагрузка сортировки. */
async function mutateNote(note: Note, patch: NotePatch): Promise<void> {
  const previous = notesStore.notes;
  const optimistic: Note = { ...note, ...patch };
  notesStore.notes = previous.map((n) => (n.id === note.id ? optimistic : n));
  try {
    const fromApi = await apiUpdateNote(note.id, patch);
    notesStore.notes = notesStore.notes.map((n) => (n.id === note.id ? fromApi : n));
    const topicId = navigation.activeTopicID;
    if (topicId !== null) {
      await loadNotes(topicId, navigation.activeFolderID, true);
    }
  } catch (e) {
    notesStore.notes = previous;
    throw e;
  }
}

/** Общая мутация напоминания: применить → сервер → обновить из ответа (сортировку не меняет). */
async function mutateReminder(
  note: Note,
  patch: Partial<Pick<Note, 'reminder_at' | 'reminder_repeat'>>,
  apply: () => Promise<Note>,
): Promise<void> {
  const previous = notesStore.notes;
  const optimistic: Note = { ...note, ...patch };
  notesStore.notes = previous.map((n) => (n.id === note.id ? optimistic : n));
  try {
    const fromApi = await apply();
    notesStore.notes = notesStore.notes.map((n) => (n.id === note.id ? fromApi : n));
  } catch (e) {
    notesStore.notes = previous;
    throw e;
  }
}
