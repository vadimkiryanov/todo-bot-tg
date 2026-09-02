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
  listTimerNotes,
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

/** Заметки с установленным напоминанием (все топики) — экран «⏰ Таймеры». */
export const timersStore = $state<{
  notes: Note[];
  loading: boolean;
  error: string | null;
}>({
  notes: [],
  loading: false,
  error: null,
});

/** Стор с полем notes — любой из списков (активный/архив/выполненные/таймеры). */
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

/** Загрузка заметок с таймерами (напоминаниями). silent — тихая перезагрузка. */
export async function loadTimers(silent = false): Promise<void> {
  if (!silent) {
    timersStore.loading = true;
    timersStore.notes = [];
  }
  timersStore.error = null;
  try {
    timersStore.notes = await listTimerNotes();
  } catch (e) {
    timersStore.error = e instanceof Error ? e.message : 'не удалось загрузить таймеры';
  } finally {
    if (!silent) {
      timersStore.loading = false;
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

/** В архив: убрать из активного списка/таймеров сразу, откат при ошибке. */
export async function archiveNote(note: Note): Promise<void> {
  const lists = allNoteLists().filter((l) =>
    l.store.notes.some((n) => n.id === note.id),
  );
  const previous = lists.map((l) => ({ list: l, notes: l.store.notes }));
  for (const { list } of previous) {
    list.store.notes = list.store.notes.filter((n) => n.id !== note.id);
  }
  syncActiveCache();
  try {
    await apiUpdateNote(note.id, { archived: true });
  } catch (e) {
    for (const { list, notes } of previous) {
      list.store.notes = notes;
    }
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
 * списков (активный/архив/выполненные/таймеры) — обновляем тот, где найдена.
 */
export async function saveText(note: Note, text: string): Promise<void> {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === note.text) return;
  const owner = noteOwner(note.id);
  if (owner === null) return;
  const previous = owner.store.notes;
  const optimistic: Note = { ...note, text: trimmed };
  owner.store.notes = previous.map((n) => (n.id === note.id ? optimistic : n));
  syncActiveCache();
  try {
    const fromApi = await apiUpdateNote(note.id, { text: trimmed });
    owner.store.notes = owner.store.notes.map((n) => (n.id === note.id ? fromApi : n));
    syncActiveCache();
  } catch (e) {
    owner.store.notes = previous;
    syncActiveCache();
    throw e;
  }
}

/** Удалить заметку из любого списка: оптимистично, откат при ошибке. */
export async function removeNote(note: Note): Promise<void> {
  await removeNoteFromAll(note.id, () => apiDeleteNote(note.id));
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
    const fromApi = await apiUpdateNote(note.id, { done: false });
    // Вернулась в работу — вернуть её в кеш активного контекста не нужно:
    // список перечитается при показе. Из таймеров тоже убираем.
    void fromApi;
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

/** Сброс сторов (выход из аккаунта): активные, архивные, выполненные, таймеры и кеш. */
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
  timersStore.notes = [];
  timersStore.loading = false;
  timersStore.error = null;
  notesCache.clear();
  cacheLoadedAt.clear();
  inFlight.clear();
}

// ── Owner-aware мутации ─────────────────────────────────────────────────────
// Заметка может лежать в одном из загруженных списков: активный (notesStore),
// выполненные (doneStore), архив (archivedStore), таймеры (timersStore).
// Мутации находят список, где заметка сейчас, и обновляют именно его; после
// смены состояния (done/archived/снятие напоминания) заметку убирают из
// списков, где ей больше не место.

type NoteListKind = 'active' | 'done' | 'archived' | 'timers';

interface NoteListRef {
  store: NoteListStore;
  kind: NoteListKind;
}

/** Все списки заметок в порядке приоритета поиска. */
function allNoteLists(): NoteListRef[] {
  return [
    { store: notesStore, kind: 'active' },
    { store: doneStore, kind: 'done' },
    { store: archivedStore, kind: 'archived' },
    { store: timersStore, kind: 'timers' },
  ];
}

/** Список, где сейчас лежит заметка (null — ни в одном из загруженных). */
function noteOwner(noteId: number): NoteListRef | null {
  return allNoteLists().find((l) => l.store.notes.some((n) => n.id === noteId)) ?? null;
}

/** Заметка загружена в одном из списков (активный/архив/выполненные/таймеры)?
    NotePage по этому флагу выбирает store-мутации или прямые API-вызовы. */
export function hasLoadedNote(noteId: number): boolean {
  return noteOwner(noteId) !== null;
}

/** Убрать заметку из ВСЕХ списков (done/archived/удаление). */
function hideNoteEverywhere(noteId: number): void {
  for (const l of allNoteLists()) {
    if (l.store.notes.some((n) => n.id === noteId)) {
      l.store.notes = l.store.notes.filter((n) => n.id !== noteId);
    }
  }
}

/** Удаление заметки: оптимистично убрать из всех списков, откат при ошибке. */
async function removeNoteFromAll(
  noteId: number,
  apply: () => Promise<unknown>,
): Promise<void> {
  const previous = allNoteLists().map((l) => ({ list: l, notes: l.store.notes }));
  hideNoteEverywhere(noteId);
  syncActiveCache();
  try {
    await apply();
  } catch (e) {
    for (const { list, notes } of previous) {
      list.store.notes = notes;
    }
    syncActiveCache();
    throw e;
  }
}

/**
 * Общая мутация поля (done/priority/pinned/archived): применить → сервер →
 * обновить список, где лежит заметка. done/archived скрывают заметку из
 * списков (активный список/таймеры перечитываются тихо — сортирует сервер).
 */
async function mutateNote(note: Note, patch: NotePatch): Promise<void> {
  const owner = noteOwner(note.id);
  if (owner === null) return;
  const previous = owner.store.notes;
  const optimistic: Note = { ...note, ...patch };
  owner.store.notes = previous.map((n) => (n.id === note.id ? optimistic : n));
  syncActiveCache();
  try {
    const fromApi = await apiUpdateNote(note.id, patch);
    owner.store.notes = owner.store.notes.map((n) => (n.id === note.id ? fromApi : n));
    if (fromApi.done || fromApi.archived) {
      // Выполненная/архивная заметка не показывается ни в активном списке,
      // ни в таймерах; на «склад»/в архив она попадёт при своём заходе.
      hideNoteEverywhere(fromApi.id);
    }
    syncActiveCache();
    // Тихая перезагрузка активного контекста: сортирует и скрывает done
    // сам сервер (список в кеше не должен расходиться с серверным).
    const topicId = navigation.activeTopicID;
    if (topicId !== null) {
      await loadNotes(topicId, navigation.activeFolderID, true);
    }
  } catch (e) {
    owner.store.notes = previous;
    syncActiveCache();
    throw e;
  }
}

/**
 * Общая мутация напоминания: применить → сервер → обновить список, где лежит
 * заметка. Снятое напоминание убирает заметку из списка таймеров.
 */
async function mutateReminder(
  note: Note,
  patch: Partial<Pick<Note, 'reminder_at' | 'reminder_repeat'>>,
  apply: () => Promise<Note>,
): Promise<void> {
  const owner = noteOwner(note.id);
  if (owner === null) return;
  const previous = owner.store.notes;
  const optimistic: Note = { ...note, ...patch };
  owner.store.notes = previous.map((n) => (n.id === note.id ? optimistic : n));
  syncActiveCache();
  try {
    const fromApi = await apply();
    owner.store.notes = owner.store.notes.map((n) => (n.id === note.id ? fromApi : n));
    if (owner.kind === 'timers') {
      if (fromApi.reminder_at === null) {
        owner.store.notes = owner.store.notes.filter((n) => n.id !== note.id);
      } else {
        owner.store.notes = [...owner.store.notes].sort((a, b) =>
          a.reminder_at !== null && b.reminder_at !== null
            ? a.reminder_at < b.reminder_at
              ? -1
              : 1
            : 0,
        );
      }
    }
    syncActiveCache();
  } catch (e) {
    owner.store.notes = previous;
    syncActiveCache();
    throw e;
  }
}
