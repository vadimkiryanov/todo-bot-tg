import { request } from './client';
import type { Folder } from '../types/api';

/** Папки уровня топика: без parent_id — корневые, с parent_id — подпапки. */
export function listFolders(topicId: number, parentId: number | null = null): Promise<Folder[]> {
  const params = new URLSearchParams({ topic_id: String(topicId) });
  if (parentId !== null) {
    params.set('parent_id', String(parentId));
  }
  return request<Folder[]>('GET', `/api/v1/folders?${params.toString()}`);
}

/** Все папки топика (все уровни вложенности) — для дерева перемещения. */
export function listAllFolders(topicId: number): Promise<Folder[]> {
  return request<Folder[]>('GET', `/api/v1/folders?topic_id=${topicId}&all=true`);
}

export function createFolder(
  topicId: number,
  name: string,
  parentId: number | null = null,
): Promise<Folder> {
  const body: Record<string, unknown> = { topic_id: topicId, name };
  if (parentId !== null) {
    body.parent_folder_id = parentId;
  }
  return request<Folder>('POST', '/api/v1/folders', body);
}

export function renameFolder(id: number, name: string): Promise<Folder> {
  return request<Folder>('PATCH', `/api/v1/folders/${id}`, { name });
}

export function deleteFolder(id: number): Promise<void> {
  return request<void>('DELETE', `/api/v1/folders/${id}`);
}
