// Заметки: список активного контекста (топик+папка), архив, выполненные —
// с оптимистичными мутациями и откатом. Сортировку не дублируем: после
// мутаций тихо перезагружаем список — сортирует сервер.
//
// Кеш контекстов: заметки каждого (топик, папка) хранятся в notesCache.
// Активный контекст при наличии кеша показывается сразу (stale-while-
// revalidate), свежесть догружается фоном; соседние топики предзагружаются
// preloadTopicNeighbors — свайп между топиками не ждёт сеть.
import { create } from 'zustand';

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
import { useNavigationStore } from './navigation';

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

interface NotesState {
  notes: Note[];
  loading: boolean;
  error: string | null;
  /** ID только что созданной заметки — карточка подсвечивается пару секунд. */
  highlightedId: number | null;
  // Архивные заметки (все топики).
  archivedNotes: Note[];
  archivedLoading: boolean;
  archivedError: string | null;
  // Выполненные заметки (все топики) — «склад» выполненных.
  doneNotes: Note[];
  doneLoading: boolean;
  doneError: string | null;
  // Заметки с установленным напоминанием (все топики) — экран «⏰ Таймеры».
  timersNotes: Note[];
  timersLoading: boolean;
  timersError: string | null;
  /** Реактивный «счётчик» изменений кеша контекстов. ChatView показывает
      соседние слайды-топики превью из кеша (`peekCachedNotes`) — кеш обычный
      Map, без счётчика превью не пересобралось бы после фоновой подгрузки. */
  cacheTick: number;
}

export const useNotesStore = create<NotesState>()(() => ({
  notes: [],
  loading: false,
  error: null,
  highlightedId: null,
  archivedNotes: [],
  archivedLoading: false,
  archivedError: null,
  doneNotes: [],
  doneLoading: false,
  doneError: null,
  timersNotes: [],
  timersLoading: false,
  timersError: null,
  cacheTick: 0,
}));

function bumpNotesCacheTick(): void {
  useNotesStore.setState((s) => ({ cacheTick: s.cacheTick + 1 }));
}

/** Контекст активен? (защита от гонок при быстрых переключениях). */
function isActiveContext(topicId: number, folderId: number | null): boolean {
  const nav = useNavigationStore.getState();
  return nav.activeTopicID === topicId && nav.activeFolderID === folderId;
}

function activeCacheKey(): string | null {
  const nav = useNavigationStore.getState();
  if (nav.activeTopicID === null) return null;
  return ctxKey(nav.activeTopicID, nav.activeFolderID);
}

/** Кеш активного контекста держим в синхроне с показанным списком. */
function syncActiveCache(): void {
  const key = activeCacheKey();
  if (key !== null && notesCache.has(key)) {
    notesCache.set(key, useNotesStore.getState().notes);
    bumpNotesCacheTick();
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
 * перезагрузка (после мутации/для предзагрузки). force — требовать свежий
 * запрос даже при идущем: для перезагрузок ПОСЛЕ мутации результат запроса,
 * начатого до неё, устарел (новой заметки/смены done в нём нет) — ждём
 * старый, чтобы он не применился позже, и запрашиваем заново. Если активный
 * контекст уже закеширован и это не фоновая загрузка — показываем кеш сразу,
 * свежесть догружаем фоном (без загрузочного экрана).
 */
export async function loadNotes(
  topicId: number,
  folderId: number | null = null,
  silent = false,
  force = false,
): Promise<void> {
  const key = ctxKey(topicId, folderId);
  const active = isActiveContext(topicId, folderId);
  const cached = notesCache.get(key);

  // Активный контекст с кешем: показываем сразу, обновление — фоном.
  if (active && cached !== undefined && !silent) {
    useNotesStore.setState({ notes: cached, error: null, loading: false });
    return loadNotes(topicId, folderId, true);
  }

  if (active && !silent) {
    useNotesStore.setState({ loading: true, notes: [] });
  }
  if (active) {
    useNotesStore.setState({ error: null });
  }

  const pending = inFlight.get(key);
  if (pending !== undefined) {
    // Тот же контекст уже грузится — дожидаемся, чтобы его результат не
    // применился после нашего. Для обычного вызова этого достаточно; после
    // мутации (force) результат старого запроса устарел — идём в сеть ещё раз.
    await pending.catch(() => {});
    if (!force) {
      if (active && !silent) {
        useNotesStore.setState({ loading: false });
      }
      return;
    }
  }

  const run = (async () => {
    try {
      const notes = await listNotes(topicId, folderId);
      notesCache.set(key, notes);
      cacheLoadedAt.set(key, Date.now());
      bumpNotesCacheTick();
      trimCache();
      if (isActiveContext(topicId, folderId)) {
        useNotesStore.setState({ notes, error: null });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'не удалось загрузить заметки';
      // Если показываем кеш — ошибку не выводим на весь экран (список остаётся).
      if (isActiveContext(topicId, folderId) && !notesCache.has(key)) {
        useNotesStore.setState({ error: msg });
      }
    } finally {
      inFlight.delete(key);
      if (active && !silent) {
        useNotesStore.setState({ loading: false });
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
  bumpNotesCacheTick();
}

/** Загрузка архива. silent — тихая перезагрузка. */
export async function loadArchived(silent = false): Promise<void> {
  if (!silent) {
    useNotesStore.setState({ archivedLoading: true, archivedNotes: [] });
  }
  useNotesStore.setState({ archivedError: null });
  try {
    const notes = await listArchivedNotes();
    useNotesStore.setState({ archivedNotes: notes });
  } catch (e) {
    useNotesStore.setState({
      archivedError: e instanceof Error ? e.message : 'не удалось загрузить архив',
    });
  } finally {
    if (!silent) {
      useNotesStore.setState({ archivedLoading: false });
    }
  }
}

/** Загрузка выполненных («склад»). silent — тихая перезагрузка. */
export async function loadDone(silent = false): Promise<void> {
  if (!silent) {
    useNotesStore.setState({ doneLoading: true, doneNotes: [] });
  }
  useNotesStore.setState({ doneError: null });
  try {
    const notes = await listDoneNotes();
    useNotesStore.setState({ doneNotes: notes });
  } catch (e) {
    useNotesStore.setState({
      doneError: e instanceof Error ? e.message : 'не удалось загрузить выполненные',
    });
  } finally {
    if (!silent) {
      useNotesStore.setState({ doneLoading: false });
    }
  }
}

/** Загрузка заметок с таймерами (напоминаниями). silent — тихая перезагрузка. */
export async function loadTimers(silent = false): Promise<void> {
  if (!silent) {
    useNotesStore.setState({ timersLoading: true, timersNotes: [] });
  }
  useNotesStore.setState({ timersError: null });
  try {
    const notes = await listTimerNotes();
    useNotesStore.setState({ timersNotes: notes });
  } catch (e) {
    useNotesStore.setState({
      timersError: e instanceof Error ? e.message : 'не удалось загрузить таймеры',
    });
  } finally {
    if (!silent) {
      useNotesStore.setState({ timersLoading: false });
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
  const nav = useNavigationStore.getState();
  if (nav.activeTopicID === null) return;
  const topicId = nav.activeTopicID;
  const folderId = nav.activeFolderID;
  const note = await apiCreateNote(topicId, text, folderId, opts);
  const state = useNotesStore.getState();
  useNotesStore.setState({ notes: [...state.notes, note], highlightedId: note.id });
  syncActiveCache();
  // force: список перечитываем свежим — запрос, начатый до создания заметки,
  // её не содержит и затёр бы подсветку только что добавленной карточки.
  await loadNotes(topicId, folderId, true, true);
}

/** Снять подсветку «только что добавленной» заметки. */
export function clearNoteHighlight(): void {
  useNotesStore.setState({ highlightedId: null });
}

/** Перемещение заметки в топик/папку (folderId null — в корень топика).
    Если заметка была в активном списке и ушла из него (или пришла в него
    из другого топика/папки) — активный список перезагружаем. */
export async function moveNote(
  note: Note,
  topicId: number,
  folderId: number | null,
): Promise<void> {
  if (note.topic_id === topicId && note.folder_id === folderId) return;
  await apiMoveNote(note.id, topicId, folderId);
  const nav = useNavigationStore.getState();
  const activeTopic = nav.activeTopicID;
  if (activeTopic === null) return;
  const activeFolder = nav.activeFolderID;
  // Список активного контекста: все заметки топика (folder null) или заметки
  // активной папки. Перезагрузка нужна, если заметка в списке была или стала.
  const wasInList =
    note.topic_id === activeTopic && (activeFolder === null || note.folder_id === activeFolder);
  const nowInList =
    topicId === activeTopic && (activeFolder === null || folderId === activeFolder);
  if (wasInList || nowInList) {
    // force: идущий запрос начат до перемещения и не отражает его.
    await loadNotes(activeTopic, activeFolder, true, true);
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
    kindState(l.kind).notes.some((n) => n.id === note.id),
  );
  const previous = lists.map((l) => ({ kind: l.kind, notes: kindState(l.kind).notes }));
  for (const { kind } of previous) {
    setKindNotes(kind, kindState(kind).notes.filter((n) => n.id !== note.id));
  }
  syncActiveCache();
  try {
    await apiUpdateNote(note.id, { archived: true });
  } catch (e) {
    for (const { kind, notes } of previous) {
      setKindNotes(kind, notes);
    }
    syncActiveCache();
    throw e;
  }
}

/** Вернуть из архива: убрать из архивного списка, откат при ошибке. */
export async function unarchiveNote(note: Note): Promise<void> {
  const previous = kindState('archived').notes;
  setKindNotes('archived', previous.filter((n) => n.id !== note.id));
  try {
    await apiUpdateNote(note.id, { archived: false });
  } catch (e) {
    setKindNotes('archived', previous);
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
  const previous = kindState(owner.kind).notes;
  const optimistic: Note = { ...note, text: trimmed };
  setKindNotes(owner.kind, previous.map((n) => (n.id === note.id ? optimistic : n)));
  syncActiveCache();
  try {
    const fromApi = await apiUpdateNote(note.id, { text: trimmed });
    setKindNotes(
      owner.kind,
      kindState(owner.kind).notes.map((n) => (n.id === note.id ? fromApi : n)),
    );
    syncActiveCache();
  } catch (e) {
    setKindNotes(owner.kind, previous);
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
  const previous = kindState('archived').notes;
  setKindNotes('archived', previous.filter((n) => n.id !== note.id));
  try {
    await apiDeleteNote(note.id);
  } catch (e) {
    setKindNotes('archived', previous);
    throw e;
  }
}

/** Вернуть в работу с экрана «Выполненные»: убрать со склада, откат при ошибке. */
export async function undoneNote(note: Note): Promise<void> {
  const previous = kindState('done').notes;
  setKindNotes('done', previous.filter((n) => n.id !== note.id));
  try {
    const fromApi = await apiUpdateNote(note.id, { done: false });
    // Вернулась в работу — вернуть её в кеш активного контекста не нужно:
    // список перечитается при показе. Из таймеров тоже убираем.
    void fromApi;
  } catch (e) {
    setKindNotes('done', previous);
    throw e;
  }
}

/** Удалить с экрана «Выполненные»: оптимистично, откат при ошибке. */
export async function removeDoneNote(note: Note): Promise<void> {
  const previous = kindState('done').notes;
  setKindNotes('done', previous.filter((n) => n.id !== note.id));
  try {
    await apiDeleteNote(note.id);
  } catch (e) {
    setKindNotes('done', previous);
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
  useNotesStore.setState({
    notes: [],
    loading: false,
    error: null,
    highlightedId: null,
    archivedNotes: [],
    archivedLoading: false,
    archivedError: null,
    doneNotes: [],
    doneLoading: false,
    doneError: null,
    timersNotes: [],
    timersLoading: false,
    timersError: null,
  });
  notesCache.clear();
  cacheLoadedAt.clear();
  inFlight.clear();
  bumpNotesCacheTick();
}

// ── Owner-aware мутации ─────────────────────────────────────────────────────
// Заметка может лежать в одном из загруженных списков: активный (notes),
// выполненные (done), архив (archived), таймеры (timers). Мутации находят
// список, где заметка сейчас, и обновляют именно его; после смены состояния
// (done/archived/снятие напоминания) заметку убирают из списков, где ей
// больше не место.

type NoteListKind = 'active' | 'done' | 'archived' | 'timers';

interface NoteListRef {
  kind: NoteListKind;
}

/** Чтение списка по его типу. */
function kindState(kind: NoteListKind): { notes: Note[]; error: string | null } {
  const s = useNotesStore.getState();
  switch (kind) {
    case 'active':
      return { notes: s.notes, error: s.error };
    case 'done':
      return { notes: s.doneNotes, error: s.doneError };
    case 'archived':
      return { notes: s.archivedNotes, error: s.archivedError };
    case 'timers':
      return { notes: s.timersNotes, error: s.timersError };
  }
}

/** Запись списка по его типу. */
function setKindNotes(kind: NoteListKind, notes: Note[]): void {
  switch (kind) {
    case 'active':
      useNotesStore.setState({ notes });
      break;
    case 'done':
      useNotesStore.setState({ doneNotes: notes });
      break;
    case 'archived':
      useNotesStore.setState({ archivedNotes: notes });
      break;
    case 'timers':
      useNotesStore.setState({ timersNotes: notes });
      break;
  }
}

/** Все списки заметок в порядке приоритета поиска. */
function allNoteLists(): NoteListRef[] {
  return [{ kind: 'active' }, { kind: 'done' }, { kind: 'archived' }, { kind: 'timers' }];
}

/** Список, где сейчас лежит заметка (null — ни в одном из загруженных). */
function noteOwner(noteId: number): NoteListRef | null {
  return (
    allNoteLists().find((l) => kindState(l.kind).notes.some((n) => n.id === noteId)) ?? null
  );
}

/** Заметка загружена в одном из списков (активный/архив/выполненные/таймеры)?
    NotePage по этому флагу выбирает store-мутации или прямые API-вызовы. */
export function hasLoadedNote(noteId: number): boolean {
  return noteOwner(noteId) !== null;
}

/** Убрать заметку из ВСЕХ списков (done/archived/удаление). */
function hideNoteEverywhere(noteId: number): void {
  for (const l of allNoteLists()) {
    if (kindState(l.kind).notes.some((n) => n.id === noteId)) {
      setKindNotes(l.kind, kindState(l.kind).notes.filter((n) => n.id !== noteId));
    }
  }
}

/** Удаление заметки: оптимистично убрать из всех списков, откат при ошибке. */
async function removeNoteFromAll(
  noteId: number,
  apply: () => Promise<unknown>,
): Promise<void> {
  const previous = allNoteLists().map((l) => ({ kind: l.kind, notes: kindState(l.kind).notes }));
  hideNoteEverywhere(noteId);
  syncActiveCache();
  try {
    await apply();
  } catch (e) {
    for (const { kind, notes } of previous) {
      setKindNotes(kind, notes);
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
  const previous = kindState(owner.kind).notes;
  const optimistic: Note = { ...note, ...patch };
  setKindNotes(owner.kind, previous.map((n) => (n.id === note.id ? optimistic : n)));
  syncActiveCache();
  try {
    const fromApi = await apiUpdateNote(note.id, patch);
    setKindNotes(
      owner.kind,
      kindState(owner.kind).notes.map((n) => (n.id === note.id ? fromApi : n)),
    );
    if (fromApi.done || fromApi.archived) {
      // Выполненная/архивная заметка не показывается ни в активном списке,
      // ни в таймерах; на «склад»/в архив она попадёт при своём заходе.
      hideNoteEverywhere(fromApi.id);
    }
    syncActiveCache();
    // Тихая перезагрузка активного контекста: сортирует и скрывает done
    // сам сервер (список в кеше не должен расходиться с серверным).
    const nav = useNavigationStore.getState();
    if (nav.activeTopicID !== null) {
      // force: идущий запрос начат до мутации — его результат вернул бы
      // заметку/старое состояние поверх только что применённого.
      await loadNotes(nav.activeTopicID, nav.activeFolderID, true, true);
    }
  } catch (e) {
    setKindNotes(owner.kind, previous);
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
  const previous = kindState(owner.kind).notes;
  const optimistic: Note = { ...note, ...patch };
  setKindNotes(owner.kind, previous.map((n) => (n.id === note.id ? optimistic : n)));
  syncActiveCache();
  try {
    const fromApi = await apply();
    setKindNotes(
      owner.kind,
      kindState(owner.kind).notes.map((n) => (n.id === note.id ? fromApi : n)),
    );
    if (owner.kind === 'timers') {
      if (fromApi.reminder_at === null) {
        setKindNotes(owner.kind, kindState(owner.kind).notes.filter((n) => n.id !== note.id));
      } else {
        setKindNotes(
          owner.kind,
          [...kindState(owner.kind).notes].sort((a, b) =>
            a.reminder_at !== null && b.reminder_at !== null
              ? a.reminder_at < b.reminder_at
                ? -1
                : 1
              : 0,
          ),
        );
      }
    }
    syncActiveCache();
  } catch (e) {
    setKindNotes(owner.kind, previous);
    syncActiveCache();
    throw e;
  }
}
