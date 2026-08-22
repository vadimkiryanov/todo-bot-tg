import { request } from './client';
import type { Note, Priority } from '../types/api';

export function listNotes(topicId: number): Promise<Note[]> {
  return request<Note[]>('GET', `/api/v1/notes?topic_id=${topicId}`);
}

export function createNote(topicId: number, text: string): Promise<Note> {
  return request<Note>('POST', '/api/v1/notes', { topic_id: topicId, text });
}

export interface NotePatch {
  text?: string;
  done?: boolean;
  priority?: Priority;
}

export function updateNote(id: number, patch: NotePatch): Promise<Note> {
  return request<Note>('PATCH', `/api/v1/notes/${id}`, patch);
}

export function deleteNote(id: number): Promise<void> {
  return request<void>('DELETE', `/api/v1/notes/${id}`);
}
