// Заметки: список активного топика + оптимистичные мутации (✅, приоритет) с откатом.
// Сортировку не дублируем: после мутаций тихо перезагружаем список — сортирует сервер.
import {
  createNote as apiCreateNote,
  deleteNote as apiDeleteNote,
  listNotes,
  updateNote as apiUpdateNote,
  type NotePatch,
} from '../api/notes';
import type { Note, Priority } from '../types/api';
import { navigation } from './navigation.svelte';

export const notesStore = $state<{
  notes: Note[];
  loading: boolean;
  error: string | null;
}>({
  notes: [],
  loading: false,
  error: null,
});

/** Загрузка заметок топика. silent — тихая перезагрузка (например, после мутации). */
export async function loadNotes(topicId: number, silent = false): Promise<void> {
  if (!silent) {
    notesStore.loading = true;
    notesStore.notes = [];
  }
  notesStore.error = null;
  try {
    const notes = await listNotes(topicId);
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

/** Создание заметки в активном топике; после — серверная сортировка. */
export async function createNote(text: string): Promise<void> {
  const topicId = navigation.activeTopicID;
  if (topicId === null) return;
  const note = await apiCreateNote(topicId, text);
  notesStore.notes = [...notesStore.notes, note];
  await loadNotes(topicId, true);
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
      await loadNotes(topicId, true);
    }
  } catch (e) {
    notesStore.notes = previous;
    throw e;
  }
}
