import { request } from './client';
import type { NotificationItem } from '../types/api';

/** Журнал «пришедших уведомлений» (свежие сверху). */
export function listNotifications(): Promise<NotificationItem[]> {
  return request<NotificationItem[]>('GET', '/api/v1/notifications');
}

/**
 * Пометить уведомления прочитанными. ids пустой/отсутствует — все.
 */
export function markNotificationsRead(ids: number[] = []): Promise<void> {
  return request<void>('POST', '/api/v1/notifications/read', { ids });
}
