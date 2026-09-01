import { request } from './client';
import type { Note, Priority, ReminderRepeat } from '../types/api';

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

/** Опциональные атрибуты новой заметки (панель создания). */
export interface CreateNoteOptions {
  done?: boolean;
  pinned?: boolean;
  priority?: Priority;
  reminder_at?: string; // ISO 8601 (UTC)
  reminder_repeat?: ReminderRepeat;
}

/** Создание заметки. folderId null — в корне топика. */
export function createNote(
  topicId: number,
  text: string,
  folderId: number | null = null,
  opts: CreateNoteOptions = {},
): Promise<Note> {
  const body: Record<string, unknown> = { topic_id: topicId, text };
  if (folderId !== null) {
    body.folder_id = folderId;
  }
  if (opts.done !== undefined) body.done = opts.done;
  if (opts.pinned !== undefined) body.pinned = opts.pinned;
  if (opts.priority !== undefined) body.priority = opts.priority;
  if (opts.reminder_at !== undefined) body.reminder_at = opts.reminder_at;
  if (opts.reminder_repeat !== undefined) body.reminder_repeat = opts.reminder_repeat;
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

/** Установка/перенос напоминания. at — ISO 8601 (UTC). */
export function setReminder(id: number, at: string, repeat: ReminderRepeat): Promise<Note> {
  return request<Note>('PUT', `/api/v1/notes/${id}/reminder`, { at, repeat });
}

/** Снятие напоминания. */
export function clearReminder(id: number): Promise<Note> {
  return request<Note>('DELETE', `/api/v1/notes/${id}/reminder`);
}
