// Заметки: список активного контекста (топик+папка), архив, выполненные —
// с оптимистичными мутациями и откатом. Сортировку не дублируем: после
// мутаций тихо перезагружаем список — сортирует сервер.
//
// Кеш контекстов: заметки каждого (топик, папка) хранятся в notesCache.
// Активный контекст при наличии кеша показывается сразу (stale-while-
// revalidate), свежесть догружается фоном; соседние топики предзагружаются
// preloadTopicNeighbors — свайп между топиками не ждёт сеть.
import {
  clearReminder as apiClearReminder,
  createNote as apiCreateNote,
  deleteNote as apiDeleteNote,
  listArchivedNotes,
  listDoneNotes,
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

/** Выполненные заметки (все топики) — «склад» выполненных. */
export const doneStore = $state<{
  notes: Note[];
  loading: boolean;
  error: string | null;
}>({
  notes: [],
  loading: false,
  error: null,
});

/** Стор с полем notes — любой из трёх списков (активный/архив/выполненные). */
interface NoteListStore {
  notes: Note[];
  error: string | null;
}

// ── Кеш контекстов ─────────────────────────────────────────────────────────
// Ключ — «топик:папка» (папка пустая = корень топика, весь топик).
const ctxKey = (topicId: number, folderId: number | null): string =>
  `${topicId}:${folderId ?? ''}`;

/** Ограничение размера кеша: старые контексты вытесняются. */
const CACHE_LIMIT = 60;

const notesCache = new Map<string, Note[]>();
const cacheLoadedAt = new Map<string, number>();
/** Идущие запросы (тихая фоновая загрузка не дублирует сетевой вызов). */
const inFlight = new Map<string, Promise<void>>();

/** Контекст активен? (защита от гонок при быстрых переключениях). */
function isActiveContext(topicId: number, folderId: number | null): boolean {
  return navigation.activeTopicID === topicId && navigation.activeFolderID === folderId;
}

function activeCacheKey(): string | null {
  const topicId = navigation.activeTopicID;
  if (topicId === null) return null;
  return ctxKey(topicId, navigation.activeFolderID);
}

/** Кеш активного контекста держим в синхроне с показанным списком. */
function syncActiveCache(): void {
  const key = activeCacheKey();
  if (key !== null && notesCache.has(key)) {
    notesCache.set(key, notesStore.notes);
  }
}

function trimCache(): void {
  while (notesCache.size > CACHE_LIMIT) {
    const oldest = notesCache.keys().next().value as string | undefined;
    if (oldest === undefined) return;
    notesCache.delete(oldest);
    cacheLoadedAt.delete(oldest);
  }
}

/** Заметки контекста (topicId, folderId) есть в кеше и не старше maxAgeMs. */
export function isNotesCached(
  topicId: number,
  folderId: number | null = null,
  maxAgeMs = 30_000,
): boolean {
  const at = cacheLoadedAt.get(ctxKey(topicId, folderId));
  return at !== undefined && Date.now() - at < maxAgeMs;
}

/** Заметки контекста из кеша без загрузки (undefined — нет в кеше).
    Нужно для превью соседнего топика при свайпе: читаем готовый список,
    не трогая сеть и не «переключая» контекст. */
export function peekCachedNotes(
  topicId: number,
  folderId: number | null = null,
): Note[] | undefined {
  return notesCache.get(ctxKey(topicId, folderId));
}

/**
 * Загрузка заметок контекста (топик+папка). silent — тихая фоновая
 * перезагрузка (после мутации/для предзагрузки). Если активный контекст уже
 * закеширован и это не фоновая загрузка — показываем кеш сразу, свежесть
 * догружаем фоном (без загрузочного экрана).
 */
export async function loadNotes(
  topicId: number,
  folderId: number | null = null,
  silent = false,
): Promise<void> {
  const key = ctxKey(topicId, folderId);
  const active = isActiveContext(topicId, folderId);
  const cached = notesCache.get(key);

  // Активный контекст с кешем: показываем сразу, обновление — фоном.
  if (active && cached !== undefined && !silent) {
    notesStore.notes = cached;
    notesStore.error = null;
    notesStore.loading = false;
    return loadNotes(topicId, folderId, true);
  }

  if (active && !silent) {
    notesStore.loading = true;
    notesStore.notes = [];
  }
  if (active) {
    notesStore.error = null;
  }

  const pending = inFlight.get(key);
  if (pending !== undefined) {
    // Тот же контекст уже грузится фоном — дожидаемся и применяем его результат.
    await pending.catch(() => {});
    if (active && !silent) {
      notesStore.loading = false;
    }
    return;
  }

  const run = (async () => {
    try {
      const notes = await listNotes(topicId, folderId);
      notesCache.set(key, notes);
      cacheLoadedAt.set(key, Date.now());
      trimCache();
      if (isActiveContext(topicId, folderId)) {
        notesStore.notes = notes;
        notesStore.error = null;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'не удалось загрузить заметки';
      // Если показываем кеш — ошибку не выводим на весь экран (список остаётся).
      if (isActiveContext(topicId, folderId) && !notesCache.has(key)) {
        notesStore.error = msg;
      }
    } finally {
      inFlight.delete(key);
      if (active && !silent) {
        notesStore.loading = false;
      }
    }
  })();
  inFlight.set(key, run);
  await run;
}

/**
 * Предзагрузка соседних топиков для быстрого свайпа: сначала корень активного
 * топика, затем ближайшие слева и справа — по очереди (без всплеска запросов).
 * Кеширует только корневой уровень: переключение топика всегда возвращает в корень.
 */
export async function preloadTopicNeighbors(
  centerId: number,
  neighbors: number[],
): Promise<void> {
  if (!isNotesCached(centerId, null)) {
    await loadNotes(centerId, null, true);
  }
  for (const id of neighbors) {
    if (!isNotesCached(id, null)) {
      await loadNotes(id, null, true);
    }
  }
}

/** Сброс кеша удалённого топика (заметки удалены каскадом на сервере). */
export function pruneNotesCacheForTopic(topicId: number): void {
  const prefix = `${topicId}:`;
  for (const key of [...notesCache.keys()]) {
    if (key.startsWith(prefix)) {
      notesCache.delete(key);
      cacheLoadedAt.delete(key);
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

/** Загрузка выполненных («склад»). silent — тихая перезагрузка. */
export async function loadDone(silent = false): Promise<void> {
  if (!silent) {
    doneStore.loading = true;
    doneStore.notes = [];
  }
  doneStore.error = null;
  try {
    doneStore.notes = await listDoneNotes();
  } catch (e) {
    doneStore.error = e instanceof Error ? e.message : 'не удалось загрузить выполненные';
  } finally {
    if (!silent) {
      doneStore.loading = false;
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
  syncActiveCache();
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
  syncActiveCache();
  try {
    await apiUpdateNote(note.id, { archived: true });
  } catch (e) {
    notesStore.notes = previous;
    syncActiveCache();
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

/**
 * Сохранить текст заметки (редактирование). Заметка может лежать в любом из
 * списков (активный/архив/выполненные) — обновляем тот, где она найдена.
 */
export async function saveText(note: Note, text: string): Promise<void> {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === note.text) return;
  const target = [notesStore, archivedStore, doneStore].find((s) =>
    s.notes.some((n) => n.id === note.id),
  );
  if (target === undefined) return;
  const previous = target.notes;
  const optimistic: Note = { ...note, text: trimmed };
  target.notes = previous.map((n) => (n.id === note.id ? optimistic : n));
  syncActiveCache();
  try {
    const fromApi = await apiUpdateNote(note.id, { text: trimmed });
    target.notes = target.notes.map((n) => (n.id === note.id ? fromApi : n));
    syncActiveCache();
  } catch (e) {
    target.notes = previous;
    syncActiveCache();
    throw e;
  }
}

/** Удалить: оптимистично, откат при ошибке. */
export async function removeNote(note: Note): Promise<void> {
  const previous = notesStore.notes;
  notesStore.notes = previous.filter((n) => n.id !== note.id);
  syncActiveCache();
  try {
    await apiDeleteNote(note.id);
  } catch (e) {
    notesStore.notes = previous;
    syncActiveCache();
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

/** Вернуть в работу с экрана «Выполненные»: убрать со склада, откат при ошибке. */
export async function undoneNote(note: Note): Promise<void> {
  const previous = doneStore.notes;
  doneStore.notes = previous.filter((n) => n.id !== note.id);
  try {
    await apiUpdateNote(note.id, { done: false });
  } catch (e) {
    doneStore.notes = previous;
    throw e;
  }
}

/** Удалить с экрана «Выполненные»: оптимистично, откат при ошибке. */
export async function removeDoneNote(note: Note): Promise<void> {
  const previous = doneStore.notes;
  doneStore.notes = previous.filter((n) => n.id !== note.id);
  try {
    await apiDeleteNote(note.id);
  } catch (e) {
    doneStore.notes = previous;
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

/** Сброс сторов (выход из аккаунта): активные, архивные, выполненные и кеш. */
export function resetNotes(): void {
  notesStore.notes = [];
  notesStore.loading = false;
  notesStore.error = null;
  notesStore.highlightedId = null;
  archivedStore.notes = [];
  archivedStore.loading = false;
  archivedStore.error = null;
  doneStore.notes = [];
  doneStore.loading = false;
  doneStore.error = null;
  notesCache.clear();
  cacheLoadedAt.clear();
  inFlight.clear();
}

/** Общая мутация поля (done/priority): применить → сервер → тихая перезагрузка сортировки. */
async function mutateNote(note: Note, patch: NotePatch): Promise<void> {
  const previous = notesStore.notes;
  const optimistic: Note = { ...note, ...patch };
  notesStore.notes = previous.map((n) => (n.id === note.id ? optimistic : n));
  syncActiveCache();
  try {
    const fromApi = await apiUpdateNote(note.id, patch);
    notesStore.notes = notesStore.notes.map((n) => (n.id === note.id ? fromApi : n));
    syncActiveCache();
    const topicId = navigation.activeTopicID;
    if (topicId !== null) {
      await loadNotes(topicId, navigation.activeFolderID, true);
    }
  } catch (e) {
    notesStore.notes = previous;
    syncActiveCache();
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
  syncActiveCache();
  try {
    const fromApi = await apply();
    notesStore.notes = notesStore.notes.map((n) => (n.id === note.id ? fromApi : n));
    syncActiveCache();
  } catch (e) {
    notesStore.notes = previous;
    syncActiveCache();
    throw e;
  }
}
