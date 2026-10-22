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
import { toastError, toastSuccess } from './toast';

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

/** Показать активному топику его папки из кеша — без запроса. Нужно при
    переключении топика во время анимации ленты: топик уже предзагружен как
    соседний, уровень готов, а сеть до остановки запрещена. false — кеша нет. */
export function showCachedFolders(topicId: number): boolean {
  const cached = foldersByTopic.get(topicId);
  if (cached === undefined) return false;
  showFoldersIfActive(topicId, cached);
  return true;
}

/** Оставить в кеше папки только перечисленных топиков (окрестность
    активного) — дальние вытесняются, чтобы память не росла со всеми
    посещёнными топиками. */
export function retainFoldersCache(topicIds: ReadonlySet<number>): void {
  let dropped = false;
  for (const topicId of [...foldersByTopic.keys()]) {
    if (topicIds.has(topicId)) continue;
    foldersByTopic.delete(topicId);
    foldersLoadedAt.delete(topicId);
    dropped = true;
  }
  if (dropped) bumpFoldersCacheTick();
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

/** Показать папки топика, если он активен ПРЯМО СЕЙЧАС: после await
    активный топик мог смениться, чужие папки на экран не попадают. */
function showFoldersIfActive(topicId: number, folders: Folder[]): void {
  if (useNavigationStore.getState().activeTopicID === topicId) {
    useFoldersStore.setState({ all: folders, topicId });
  }
}

/** Загрузка всех папок топика. silent — тихая загрузка (предзагрузка
    соседа): наполняет кеш и НЕ трогает показанный список, если топик не
    активен. Иначе предзагрузка соседа сбрасывала папки активного топика
    (topicId: null) — уровень залипал на скелетоне до смены топика
    (foldersReady не выполнялся), хотя заметки уже были загружены. */
export async function loadFolders(topicId: number, silent = false): Promise<void> {
  if (!silent) useFoldersStore.setState({ loading: true });
  // Ошибку активного топика тихая чужая загрузка не сбрасывает.
  const activeAtStart = useNavigationStore.getState().activeTopicID === topicId;
  if (!silent || activeAtStart) useFoldersStore.setState({ error: null });
  // Сразу показываем кешированные папки активного топика — переключение
  // топиков в шторке не моргает скелетоном (данные всё равно обновятся).
  const cached = foldersByTopic.get(topicId);
  if (cached !== undefined) {
    showFoldersIfActive(topicId, cached);
  } else if (!silent && useFoldersStore.getState().topicId !== topicId) {
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
    const fresh = foldersByTopic.get(topicId);
    if (fresh !== undefined) showFoldersIfActive(topicId, fresh);
    if (!silent) useFoldersStore.setState({ loading: false });
    return;
  }

  const run = (async () => {
    try {
      const folders = await listAllFolders(topicId);
      foldersLoadedAt.set(topicId, Date.now());
      setTopicFolders(topicId, folders);
      showFoldersIfActive(topicId, folders);
    } catch (e) {
      // Ошибку показываем только для активного топика без кеша (со старым
      // кешем список остаётся) — сбой предзагрузки соседа не должен
      // помечать «не загрузились» папки открытого топика.
      if (useNavigationStore.getState().activeTopicID === topicId && !foldersByTopic.has(topicId)) {
        useFoldersStore.setState({
          error: e instanceof Error ? e.message : 'не удалось загрузить папки',
        });
      }
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

/** Ошибка операции с папкой: тост + проброс (компоненты ловят для инлайна). */
function folderOpError(e: unknown, fallback: string): Error {
  const err = e instanceof Error ? e : new Error(fallback);
  toastError(err.message);
  return err;
}

/** Создание папки на текущем уровне (в активной папке или в корне топика). */
export async function createFolder(name: string): Promise<void> {
  const { activeTopicID, activeFolderID } = useNavigationStore.getState();
  if (activeTopicID === null) return;
  let folder: Folder;
  try {
    folder = await apiCreateFolder(activeTopicID, name, activeFolderID);
  } catch (e) {
    throw folderOpError(e, 'не удалось создать папку');
  }
  const state = useFoldersStore.getState();
  const updated = [...state.all, folder];
  useFoldersStore.setState({ all: updated, topicId: activeTopicID });
  setTopicFolders(activeTopicID, updated);
  toastSuccess('Папка создана');
}

export async function renameFolder(id: number, name: string): Promise<void> {
  let updated: Folder;
  try {
    updated = await apiRenameFolder(id, name);
  } catch (e) {
    throw folderOpError(e, 'не удалось переименовать папку');
  }
  const state = useFoldersStore.getState();
  useFoldersStore.setState({ all: state.all.map((f) => (f.id === id ? updated : f)) });
  // Кеш топика папки тоже обновляем (если он загружен).
  const topicId = useNavigationStore.getState().activeTopicID;
  if (topicId !== null && foldersByTopic.has(topicId)) {
    setTopicFolders(topicId, useFoldersStore.getState().all);
  }
  toastSuccess('Папка переименована');
}

/** Удаление папки: каскад по стору (поддерево); если удалена активная или её предок — выход в корень. */
export async function deleteFolder(id: number): Promise<void> {
  try {
    await apiDeleteFolder(id);
  } catch (e) {
    throw folderOpError(e, 'не удалось удалить папку');
  }
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
  toastSuccess('Папка удалена');
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
