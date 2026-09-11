import { request } from './client';
import type { Topic } from '../types/api';

export function listTopics(): Promise<Topic[]> {
  return request<Topic[]>('GET', '/api/v1/topics');
}

export function createTopic(name: string): Promise<Topic> {
  return request<Topic>('POST', '/api/v1/topics', { name });
}

export function renameTopic(id: number, name: string): Promise<Topic> {
  return request<Topic>('PATCH', `/api/v1/topics/${id}`, { name });
}

/** Закрепить/открепить топик (быстрый топик бота). Тот же PATCH, что и
 *  переименование: тело может нести одно поле или оба сразу. */
export function setTopicPinned(id: number, pinned: boolean): Promise<Topic> {
  return request<Topic>('PATCH', `/api/v1/topics/${id}`, { pinned });
}

export function deleteTopic(id: number): Promise<void> {
  return request<void>('DELETE', `/api/v1/topics/${id}`);
}
