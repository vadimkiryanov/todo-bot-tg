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
  loading: boolean;
  error: string | null;
}>({
  all: [],
  loading: false,
  error: null,
});

/** Папки текущего уровня: дети активной папки (или корневые, если папка не выбрана). */
export function levelFolders(): Folder[] {
  const parent = navigation.activeFolderID;
  return foldersStore.all.filter((f) => f.parent_folder_id === parent);
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
  if (!silent) {
    foldersStore.loading = true;
    foldersStore.all = [];
  }
  foldersStore.error = null;
  try {
    const folders = await listAllFolders(topicId);
    if (navigation.activeTopicID === topicId) {
      foldersStore.all = folders;
    }
  } catch (e) {
    foldersStore.error = e instanceof Error ? e.message : 'не удалось загрузить папки';
  } finally {
    if (!silent) {
      foldersStore.loading = false;
    }
  }
}

/** Создание папки на текущем уровне (в активной папке или в корне топика). */
export async function createFolder(name: string): Promise<void> {
  const topicId = navigation.activeTopicID;
  if (topicId === null) return;
  const folder = await apiCreateFolder(topicId, name, navigation.activeFolderID);
  foldersStore.all = [...foldersStore.all, folder];
}

export async function renameFolder(id: number, name: string): Promise<void> {
  const updated = await apiRenameFolder(id, name);
  foldersStore.all = foldersStore.all.map((f) => (f.id === id ? updated : f));
}

/** Удаление папки: каскад по стору (поддерево); если удалена активная или её предок — выход в корень. */
export async function deleteFolder(id: number): Promise<void> {
  await apiDeleteFolder(id);
  const subtree = collectSubtree(id);
  foldersStore.all = foldersStore.all.filter((f) => !subtree.has(f.id));
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
  foldersStore.loading = false;
  foldersStore.error = null;
}
