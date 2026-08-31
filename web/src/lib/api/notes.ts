import { request } from './client';
import type { Note, Priority } from '../types/api';

/** Заметки топика. folderId — фильтр по папке (null — все заметки топика). */
export function listNotes(topicId: number, folderId: number | null = null): Promise<Note[]> {
  const params = new URLSearchParams({ topic_id: String(topicId) });
  if (folderId !== null) {
    params.set('folder_id', String(folderId));
  }
  return request<Note[]>('GET', `/api/v1/notes?${params.toString()}`);
}

/** Архивные заметки (все топики). */
export function listArchivedNotes(): Promise<Note[]> {
  return request<Note[]>('GET', '/api/v1/notes?archived=true');
}

/** Создание заметки. folderId null — в корне топика. */
export function createNote(topicId: number, text: string, folderId: number | null = null): Promise<Note> {
  const body: Record<string, unknown> = { topic_id: topicId, text };
  if (folderId !== null) {
    body.folder_id = folderId;
  }
  return request<Note>('POST', '/api/v1/notes', body);
}

/** Перемещение заметки в топик/папку. folderId null — в корень топика. */
export function moveNote(noteId: number, topicId: number, folderId: number | null): Promise<Note> {
  return request<Note>('POST', `/api/v1/notes/${noteId}/move`, {
    topic_id: topicId,
    folder_id: folderId,
  });
}

export interface NotePatch {
  text?: string;
  done?: boolean;
  priority?: Priority;
  pinned?: boolean;
  archived?: boolean;
}

export function updateNote(id: number, patch: NotePatch): Promise<Note> {
  return request<Note>('PATCH', `/api/v1/notes/${id}`, patch);
}

export function deleteNote(id: number): Promise<void> {
  return request<void>('DELETE', `/api/v1/notes/${id}`);
}
