// Папки активного топика: полный список (все уровни), CRUD и производные
// для хлебных крошек (цепочка до активной папки) и дерева перемещения.
import {
  createFolder as apiCreateFolder,
  deleteFolder as apiDeleteFolder,
  listAllFolders,
  renameFolder as apiRenameFolder,
} from '../api/folders';
import type { Folder } from '../types/api';
import { navigation } from './navigation.svelte';

export const foldersStore = $state<{
  all: Folder[];
  /** Топик, чьи папки сейчас в all (для отображения без мерцания при переключении). */
  topicId: number | null;
  loading: boolean;
  error: string | null;
}>({
  all: [],
  topicId: null,
  loading: false,
  error: null,
});

/** Кеш папок по топикам: при повторном открытии топика шторка
 *  показывает папки сразу, без скелетона и мерцания. */
const foldersByTopic = new Map<number, Folder[]>();

/** Папки текущего уровня: дети активной папки (или корневые, если папка не выбрана). */
export function levelFolders(): Folder[] {
  const parent = navigation.activeFolderID;
  return foldersStore.all.filter((f) => f.parent_folder_id === parent);
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
  const childrenOf = new Map<number | null, Folder[]>();
  for (const f of foldersStore.all) {
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

/** Цепочка хлебных крошек: от корня до активной папки включительно. */
export function folderChain(): Folder[] {
  const chain: Folder[] = [];
  let current = foldersStore.all.find((f) => f.id === navigation.activeFolderID);
  const visited = new Set<number>();
  while (current !== undefined && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current =
      current.parent_folder_id === null
        ? undefined
        : foldersStore.all.find((f) => f.id === current!.parent_folder_id);
  }
  return chain;
}

/** Загрузка всех папок активного топика. silent — тихая перезагрузка. */
export async function loadFolders(topicId: number, silent = false): Promise<void> {
  if (!silent) foldersStore.loading = true;
  foldersStore.error = null;
  // Сразу показываем кешированные папки топика — переключение топиков
  // в шторке не моргает скелетоном (данные всё равно обновятся).
  const cached = foldersByTopic.get(topicId);
  if (cached !== undefined) {
    foldersStore.all = cached;
    foldersStore.topicId = topicId;
  } else if (foldersStore.topicId !== topicId) {
    // Кеша ещё нет: чужие папки не показываем (скрываются скелетоном).
    foldersStore.all = [];
    foldersStore.topicId = null;
  }
  try {
    const folders = await listAllFolders(topicId);
    foldersByTopic.set(topicId, folders);
    if (navigation.activeTopicID === topicId) {
      foldersStore.all = folders;
      foldersStore.topicId = topicId;
    }
  } catch (e) {
    foldersStore.error = e instanceof Error ? e.message : 'не удалось загрузить папки';
  } finally {
    if (!silent) foldersStore.loading = false;
  }
}

/** Создание папки на текущем уровне (в активной папке или в корне топика). */
export async function createFolder(name: string): Promise<void> {
  const topicId = navigation.activeTopicID;
  if (topicId === null) return;
  const folder = await apiCreateFolder(topicId, name, navigation.activeFolderID);
  const updated = [...foldersStore.all, folder];
  foldersStore.all = updated;
  foldersStore.topicId = topicId;
  foldersByTopic.set(topicId, updated);
}

export async function renameFolder(id: number, name: string): Promise<void> {
  const updated = await apiRenameFolder(id, name);
  foldersStore.all = foldersStore.all.map((f) => (f.id === id ? updated : f));
  // Кеш топика папки тоже обновляем (если он загружен).
  const topicId = navigation.activeTopicID;
  if (topicId !== null && foldersByTopic.has(topicId)) {
    foldersByTopic.set(topicId, foldersStore.all);
  }
}

/** Удаление папки: каскад по стору (поддерево); если удалена активная или её предок — выход в корень. */
export async function deleteFolder(id: number): Promise<void> {
  await apiDeleteFolder(id);
  const subtree = collectSubtree(id);
  foldersStore.all = foldersStore.all.filter((f) => !subtree.has(f.id));
  const topicId = navigation.activeTopicID;
  if (topicId !== null && foldersByTopic.has(topicId)) {
    foldersByTopic.set(topicId, foldersStore.all);
  }
  if (subtree.has(navigation.activeFolderID ?? -1)) {
    navigation.activeFolderID = null;
  }
}

/** BFS по подпапкам: id удаляемой папки + все вложенные. */
function collectSubtree(root: number): Set<number> {
  const subtree = new Set<number>([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of foldersStore.all) {
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
  foldersStore.all = [];
  foldersStore.topicId = null;
  foldersStore.loading = false;
  foldersStore.error = null;
  foldersByTopic.clear();
}
