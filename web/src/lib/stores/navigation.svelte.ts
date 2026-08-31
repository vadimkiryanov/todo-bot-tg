// Активный топик: выбор между сессиями, сохраняется в localStorage.
// Экраны (login/chat/archive) определяет SvelteKit-роутер по URL — здесь их нет.
import type { Topic } from '../types/api';

const ACTIVE_KEY = 'todo.activeTopicID';

export const navigation = $state<{ activeTopicID: number | null }>({
  activeTopicID: null,
});

export function setActiveTopic(id: number): void {
  navigation.activeTopicID = id;
  try {
    localStorage.setItem(ACTIVE_KEY, String(id));
  } catch {
    // localStorage недоступен — выбор не сохранится между сессиями
  }
}

/** Восстановить активный топик: последний из localStorage или первый в списке. */
export function restoreActiveTopic(topics: Topic[]): void {
  if (topics.length === 0) {
    navigation.activeTopicID = null;
    return;
  }
  let saved: number | null = null;
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (raw !== null) saved = Number(raw);
  } catch {
    // ignore
  }
  const exists = topics.some((t) => t.id === saved);
  navigation.activeTopicID = exists && saved !== null ? saved : topics[0].id;
}

/** Сброс активного топика (выход из аккаунта). */
export function resetActiveTopic(): void {
  navigation.activeTopicID = null;
  try {
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // localStorage недоступен — нечего чистить
  }
}
