// Папки активного топика: полный список (все уровни), CRUD и производные
// для хлебных крошек (цепочка до активной папки) и дерева перемещения.
import { create } from 'zustand';

import {
  createFolder as apiCreateFolder,
  deleteFolder as apiDeleteFolder,
  listAllFolders,
  renameFolder as apiRenameFolder,
} from '../api/folders';
import type { Folder } from '../types/api';
import { useNavigationStore } from './navigation';

interface FoldersState {
  all: Folder[];
  /** Топик, чьи папки сейчас в all (для отображения без мерцания при переключении). */
  topicId: number | null;
  loading: boolean;
  error: string | null;
  /** Реактивный «счётчик» изменений кеша папок. ChatView показывает соседние
      слайды-топики превью корневых папок из кеша (`peekCachedFolders`) — кеш
      обычный Map, без счётчика превью не пересобралось бы после подгрузки. */
  cacheTick: number;
}

export const useFoldersStore = create<FoldersState>()(() => ({
  all: [],
  topicId: null,
  loading: false,
  error: null,
  cacheTick: 0,
}));

/** Кеш папок по топикам: при повторном открытии топика шторка
 *  показывает папки сразу, без скелетона и мерцания. */
const foldersByTopic = new Map<number, Folder[]>();

function bumpFoldersCacheTick(): void {
  useFoldersStore.setState((s) => ({ cacheTick: s.cacheTick + 1 }));
}

/** Записать кеш папок топика + уведомить реактивных читателей. */
function setTopicFolders(topicId: number, folders: Folder[]): void {
  foldersByTopic.set(topicId, folders);
  bumpFoldersCacheTick();
}

/** Папки текущего уровня: дети активной папки (или корневые, если папка не выбрана). */
export function levelFolders(): Folder[] {
  const { all } = useFoldersStore.getState();
  const parent = useNavigationStore.getState().activeFolderID;
  return all.filter((f) => f.parent_folder_id === parent);
}

/** Все папки топика из кеша без загрузки (undefined — кеша ещё нет).
    Нужно для превью соседнего топика при свайпе: папки соседа могут быть
    в кеше (если топик уже открывали), но не в foldersStore (там только
    активный топик). */
export function peekCachedFolders(topicId: number): Folder[] | undefined {
  return foldersByTopic.get(topicId);
}

/** Узел дерева папок: папка + глубина вложенности (0 — корневая) и ветки. */
export interface FolderTreeNode {
  folder: Folder;
  depth: number;
  /** Для каждого уровня предка 0..depth-2: есть ли ветка, уходящая вниз (│). */
  continues: boolean[];
  /** Узел — последний ребёнок своего родителя (└── вместо ├──). */
  isLast: boolean;
}

/** Дерево всех папок топика: обход в глубину, порядок — как в сторе. */
export function treeFolders(): FolderTreeNode[] {
  const { all } = useFoldersStore.getState();
  const childrenOf = new Map<number | null, Folder[]>();
  for (const f of all) {
    const list = childrenOf.get(f.parent_folder_id);
    if (list !== undefined) list.push(f);
    else childrenOf.set(f.parent_folder_id, [f]);
  }
  const nodes: FolderTreeNode[] = [];
  const walk = (parent: number | null, depth: number, ancestorLines: boolean[]): void => {
    const children = childrenOf.get(parent) ?? [];
    children.forEach((f, i) => {
      const nodeIsLast = i === children.length - 1;
      nodes.push({ folder: f, depth, continues: ancestorLines, isLast: nodeIsLast });
      // Линия на уровне depth для потомков: пока у этого узла есть братья ниже.
      walk(f.id, depth + 1, [...ancestorLines, nodeIsLast ? false : true]);
    });
  };
  walk(null, 0, []);
  return nodes;
}

/** Цепочка хлебных крошек: от корня до произвольной папки включительно
    (null — пустая, корень топика). Нужна для опережающего показа пути при
    свайп-выходе из папки: уровень стора меняется после остановки ленты,
    а путь в табе/строке обновляется уже по выбору целевого слайда. */
export function folderChainTo(folderId: number | null): Folder[] {
  const { all } = useFoldersStore.getState();
  const chain: Folder[] = [];
  if (folderId === null) return chain;
  let current = all.find((f) => f.id === folderId);
  const visited = new Set<number>();
  while (current !== undefined && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current =
      current.parent_folder_id === null
        ? undefined
        : all.find((f) => f.id === current!.parent_folder_id);
  }
  return chain;
}

/** Цепочка хлебных крошек: от корня до активной папки включительно. */
export function folderChain(): Folder[] {
  return folderChainTo(useNavigationStore.getState().activeFolderID);
}

/** Запросы папок топика в полёте: параллельные вызовы (эффект смены топика +
    предзагрузка соседа) не дублируются в сеть — ждут один запрос. */
const foldersInFlight = new Map<number, Promise<void>>();

/** Запросы getTopicFolders в полёте (модалка перемещения): повторный запрос
    того же топика (быстрое переключение выбора) не дублируется в сеть. */
const topicFoldersInFlight = new Map<number, Promise<Folder[]>>();

/** Момент последнего успешного получения папок топика. */
const foldersLoadedAt = new Map<number, number>();

/** Повторный запрос в течение окна не нужен: эффекты при старте
    срабатывают дважды с интервалом <1 с, данные только что получены. */
const FOLDERS_FRESH_MS = 3000;

/** Загрузка всех папок активного топика. silent — тихая перезагрузка. */
export async function loadFolders(topicId: number, silent = false): Promise<void> {
  const state = useFoldersStore.getState();
  if (!silent) useFoldersStore.setState({ loading: true });
  useFoldersStore.setState({ error: null });
  // Сразу показываем кешированные папки топика — переключение топиков
  // в шторке не моргает скелетоном (данные всё равно обновятся).
  const cached = foldersByTopic.get(topicId);
  if (cached !== undefined) {
    useFoldersStore.setState({ all: cached, topicId });
  } else if (state.topicId !== topicId) {
    // Кеша ещё нет: чужие папки не показываем (скрываются скелетоном).
    useFoldersStore.setState({ all: [], topicId: null });
  }

  // Кеш только что обновлён — повторный запрос не нужен (ре-ран эффекта).
  const loadedAt = foldersLoadedAt.get(topicId);
  if (loadedAt !== undefined && cached !== undefined && Date.now() - loadedAt < FOLDERS_FRESH_MS) {
    if (!silent) useFoldersStore.setState({ loading: false });
    return;
  }

  // Тот же топик уже грузится (предзагрузка соседа и т.п.) — ждём его
  // результат, не начиная второй запрос.
  const pending = foldersInFlight.get(topicId);
  if (pending !== undefined) {
    await pending;
    if (useNavigationStore.getState().activeTopicID === topicId) {
      const fresh = foldersByTopic.get(topicId);
      if (fresh !== undefined) {
        useFoldersStore.setState({ all: fresh, topicId });
      }
    }
    if (!silent) useFoldersStore.setState({ loading: false });
    return;
  }

  const run = (async () => {
    try {
      const folders = await listAllFolders(topicId);
      foldersLoadedAt.set(topicId, Date.now());
      setTopicFolders(topicId, folders);
      if (useNavigationStore.getState().activeTopicID === topicId) {
        useFoldersStore.setState({ all: folders, topicId });
      }
    } catch (e) {
      useFoldersStore.setState({ error: e instanceof Error ? e.message : 'не удалось загрузить папки' });
    } finally {
      foldersInFlight.delete(topicId);
      if (!silent) useFoldersStore.setState({ loading: false });
    }
  })();
  foldersInFlight.set(topicId, run);
  await run;
}

/** Папки произвольного топика — для модалки перемещения заметки (кеш или
    загрузка). В foldersStore НЕ пишет: там всегда папки активного топика,
    подгрузка «чужого» топика не должна менять список на экране под модалкой.
    Кеш наполняет (setTopicFolders) — повторное открытие топика без сети. */
export async function getTopicFolders(topicId: number): Promise<Folder[]> {
  // Кеш свежий — сразу.
  const cached = foldersByTopic.get(topicId);
  const loadedAt = foldersLoadedAt.get(topicId);
  if (cached !== undefined && loadedAt !== undefined && Date.now() - loadedAt < FOLDERS_FRESH_MS) {
    return cached;
  }
  // Активный топик уже грузится (loadFolders) — ждём его результат.
  const pending = foldersInFlight.get(topicId);
  if (pending !== undefined) {
    await pending;
    return foldersByTopic.get(topicId) ?? [];
  }
  // Тот же запрос уже идёт (быстрое переключение выбора топика) — ждём его.
  const own = topicFoldersInFlight.get(topicId);
  if (own !== undefined) return own;

  const run = (async () => {
    const folders = await listAllFolders(topicId);
    foldersLoadedAt.set(topicId, Date.now());
    setTopicFolders(topicId, folders);
    return folders;
  })();
  topicFoldersInFlight.set(topicId, run);
  try {
    return await run;
  } finally {
    topicFoldersInFlight.delete(topicId);
  }
}

/** Создание папки на текущем уровне (в активной папке или в корне топика). */
export async function createFolder(name: string): Promise<void> {
  const { activeTopicID, activeFolderID } = useNavigationStore.getState();
  if (activeTopicID === null) return;
  const folder = await apiCreateFolder(activeTopicID, name, activeFolderID);
  const state = useFoldersStore.getState();
  const updated = [...state.all, folder];
  useFoldersStore.setState({ all: updated, topicId: activeTopicID });
  setTopicFolders(activeTopicID, updated);
}

export async function renameFolder(id: number, name: string): Promise<void> {
  const updated = await apiRenameFolder(id, name);
  const state = useFoldersStore.getState();
  useFoldersStore.setState({ all: state.all.map((f) => (f.id === id ? updated : f)) });
  // Кеш топика папки тоже обновляем (если он загружен).
  const topicId = useNavigationStore.getState().activeTopicID;
  if (topicId !== null && foldersByTopic.has(topicId)) {
    setTopicFolders(topicId, useFoldersStore.getState().all);
  }
}

/** Удаление папки: каскад по стору (поддерево); если удалена активная или её предок — выход в корень. */
export async function deleteFolder(id: number): Promise<void> {
  await apiDeleteFolder(id);
  const state = useFoldersStore.getState();
  const subtree = collectSubtree(id);
  useFoldersStore.setState({ all: state.all.filter((f) => !subtree.has(f.id)) });
  const topicId = useNavigationStore.getState().activeTopicID;
  if (topicId !== null && foldersByTopic.has(topicId)) {
    setTopicFolders(topicId, useFoldersStore.getState().all);
  }
  if (subtree.has(useNavigationStore.getState().activeFolderID ?? -1)) {
    useNavigationStore.setState({ activeFolderID: null });
  }
}

/** BFS по подпапкам: id удаляемой папки + все вложенные. */
function collectSubtree(root: number): Set<number> {
  const subtree = new Set<number>([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of useFoldersStore.getState().all) {
      if (!subtree.has(f.id) && f.parent_folder_id !== null && subtree.has(f.parent_folder_id)) {
        subtree.add(f.id);
        changed = true;
      }
    }
  }
  return subtree;
}

/** Сброс стора (выход из аккаунта, смена топика). */
export function resetFolders(): void {
  useFoldersStore.setState({ all: [], topicId: null, loading: false, error: null });
  foldersByTopic.clear();
  foldersLoadedAt.clear();
  foldersInFlight.clear();
}
