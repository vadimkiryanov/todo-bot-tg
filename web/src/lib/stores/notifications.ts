// Уведомления (журнал сработавших напоминаний, серверная таблица).
// Список опрашивается при авторизации, затем поллингом (root App);
// счётчик непрочитанных показывает бейдж на пункте 🔔 бургер-меню.
import { create } from 'zustand';

import { listNotifications, markNotificationsRead } from '../api/notifications';
import type { NotificationItem } from '../types/api';

interface NotificationsState {
  items: NotificationItem[];
  loading: boolean;
  error: string | null;
}

export const useNotificationsStore = create<NotificationsState>()(() => ({
  items: [],
  loading: false,
  error: null,
}));

/** Сколько непрочитанных среди загруженных (для бейджа 🔔). */
export function unreadCount(): number {
  return useNotificationsStore
    .getState()
    .items.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);
}

/** Загрузка журнала уведомлений. silent — тихая фоновая перезагрузка. */
export async function loadNotifications(silent = false): Promise<void> {
  if (!silent) {
    useNotificationsStore.setState({ loading: true });
  }
  useNotificationsStore.setState({ error: null });
  try {
    const items = await listNotifications();
    useNotificationsStore.setState({ items });
  } catch (e) {
    // Тихие перезагрузки (поллинг) не показывают ошибку — список не трогаем.
    if (!silent) {
      useNotificationsStore.setState({
        error: e instanceof Error ? e.message : 'не удалось загрузить уведомления',
      });
    }
  } finally {
    if (!silent) {
      useNotificationsStore.setState({ loading: false });
    }
  }
}

/** Пометить все уведомления прочитанными (открытие экрана/тап). */
export async function markAllRead(): Promise<void> {
  const hadUnread = unreadCount() > 0;
  const { items } = useNotificationsStore.getState();
  useNotificationsStore.setState({ items: items.map((n) => ({ ...n, read: true })) });
  if (!hadUnread) return;
  try {
    await markNotificationsRead();
  } catch {
    // Ошибка сервера — список останется «прочитанным» локально,
    // при следующем поллинге серверные флаги перезапишут его.
  }
}

/** Сброс (выход из аккаунта). */
export function resetNotifications(): void {
  useNotificationsStore.setState({ items: [], loading: false, error: null });
}
