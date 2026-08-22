// Навигация state-based (без роутера): экран + активный топик.
import type { Topic } from '../types/api';

const ACTIVE_KEY = 'todo.activeTopicID';

export const navigation = $state<{
  screen: 'login' | 'chat' | 'archived';
  activeTopicID: number | null;
}>({
  screen: 'login',
  activeTopicID: null,
});

export function showLogin(): void {
  navigation.screen = 'login';
}

export function showChat(): void {
  navigation.screen = 'chat';
}

export function showArchived(): void {
  navigation.screen = 'archived';
}

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
