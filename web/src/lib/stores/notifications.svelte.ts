// Уведомления (журнал сработавших напоминаний, серверная таблица).
// Список опрашивается при авторизации, затем поллингом (root layout);
// счётчик непрочитанных показывает бейдж на пункте 🔔 бургер-меню.
import {
  listNotifications,
  markNotificationsRead,
} from '../api/notifications';
import type { NotificationItem } from '../types/api';

export const notificationsStore = $state<{
  items: NotificationItem[];
  loading: boolean;
  error: string | null;
}>({
  items: [],
  loading: false,
  error: null,
});

/** Сколько непрочитанных среди загруженных (для бейджа 🔔). */
export function unreadCount(): number {
  return notificationsStore.items.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);
}

/** Загрузка журнала уведомлений. silent — тихая фоновая перезагрузка. */
export async function loadNotifications(silent = false): Promise<void> {
  if (!silent) {
    notificationsStore.loading = true;
  }
  notificationsStore.error = null;
  try {
    notificationsStore.items = await listNotifications();
  } catch (e) {
    // Тихие перезагрузки (поллинг) не показывают ошибку — список не трогаем.
    if (!silent) {
      notificationsStore.error = e instanceof Error ? e.message : 'не удалось загрузить уведомления';
    }
  } finally {
    if (!silent) {
      notificationsStore.loading = false;
    }
  }
}

/** Пометить все уведомления прочитанными (открытие экрана/тап). */
export async function markAllRead(): Promise<void> {
  const hadUnread = unreadCount() > 0;
  notificationsStore.items = notificationsStore.items.map((n) => ({ ...n, read: true }));
  if (!hadUnread) return;
  try {
    await markNotificationsRead();
  } catch {
    // Ошибка сервера — вернуть флаги? Список останется «прочитанным» локально,
    // при следующем поллинге серверные флаги перезапишут его.
  }
}

/** Сброс (выход из аккаунта). */
export function resetNotifications(): void {
  notificationsStore.items = [];
  notificationsStore.loading = false;
  notificationsStore.error = null;
}
