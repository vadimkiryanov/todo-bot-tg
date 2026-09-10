// Всплывающие подсказки (toast): короткие сообщения об итоге действия —
// «выполнено» / «ошибка». Очередь живёт в zustand-сторе, показ — ToastHost
// в корне App. Автоскрытие через DURATION_MS; в тестовом node-окружении
// window нет — таймеры не запускаются, состояние детерминировано.
import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  items: ToastItem[];
}

export const useToastStore = create<ToastState>()(() => ({ items: [] }));

/** Время показа одного тоста. */
export const TOAST_DURATION_MS = 2600;

/** Сколько тостов видно одновременно (старые вытесняются). */
export const TOAST_MAX_VISIBLE = 3;

let nextId = 1;
const timers = new Map<number, number>();

function cancelTimer(id: number): void {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

/** Убрать тост из очереди (вручную или по таймеру). */
export function dismissToast(id: number): void {
  cancelTimer(id);
  useToastStore.setState((s) => ({ items: s.items.filter((t) => t.id !== id) }));
}

/** Показать тост. Пустое сообщение игнорируется (возврат 0). */
export function showToast(message: string, kind: ToastKind = 'info'): number {
  const text = message.trim();
  if (text === '') return 0;
  const id = nextId++;
  useToastStore.setState((s) => {
    const items = [...s.items, { id, kind, message: text }];
    while (items.length > TOAST_MAX_VISIBLE) {
      const dropped = items.shift();
      if (dropped !== undefined) cancelTimer(dropped.id);
    }
    return { items };
  });
  if (typeof window !== 'undefined') {
    timers.set(
      id,
      window.setTimeout(() => dismissToast(id), TOAST_DURATION_MS),
    );
  }
  return id;
}

export function toastSuccess(message: string): number {
  return showToast(message, 'success');
}

export function toastError(message: string): number {
  return showToast(message, 'error');
}

/** Сброс очереди (выход из аккаунта). */
export function resetToasts(): void {
  for (const id of [...timers.keys()]) cancelTimer(id);
  useToastStore.setState({ items: [] });
}
