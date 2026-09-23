// Уведомления (журнал сработавших напоминаний, серверная таблица).
// Список читается один раз при авторизации (root App) и перечитывается при
// заходе на экран «Уведомления»; счётчик непрочитанных показывает бейдж на
// пункте «Уведомления» бургер-меню.
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

/** Сколько непрочитанных среди загруженных (для бейджа «Меню»). */
export function unreadCount(): number {
  return useNotificationsStore
    .getState()
    .items.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);
}

/** Загрузка журнала уведомлений. silent — без индикатора загрузки (для
    фоновых вызовов; ошибка не выводится, список не трогаем). */
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
    // при следующей загрузке журнала серверные флаги перезапишут его.
  }
}

/** Сброс (выход из аккаунта). */
export function resetNotifications(): void {
  useNotificationsStore.setState({ items: [], loading: false, error: null });
}
