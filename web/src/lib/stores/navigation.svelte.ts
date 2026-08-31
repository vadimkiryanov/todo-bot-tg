// Активный топик и активная папка: выбор между сессиями, сохраняется в localStorage.
// Экраны (login/chat/archive) определяет SvelteKit-роутер по URL — здесь их нет.
import type { Topic } from '../types/api';

const ACTIVE_KEY = 'todo.activeTopicID';

export const navigation = $state<{
  activeTopicID: number | null;
  activeFolderID: number | null;
}>({
  activeTopicID: null,
  activeFolderID: null,
});

export function setActiveTopic(id: number): void {
  navigation.activeTopicID = id;
  // Смена топика сбрасывает навигацию по папкам в корень.
  navigation.activeFolderID = null;
  try {
    localStorage.setItem(ACTIVE_KEY, String(id));
  } catch {
    // localStorage недоступен — выбор не сохранится между сессиями
  }
}

export function setActiveFolder(id: number | null): void {
  navigation.activeFolderID = id;
}

/** Восстановить активный топик: последний из localStorage или первый в списке. */
export function restoreActiveTopic(topics: Topic[]): void {
  if (topics.length === 0) {
    navigation.activeTopicID = null;
    navigation.activeFolderID = null;
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
  navigation.activeFolderID = null;
}

/** Сброс активного топика и папки (выход из аккаунта). */
export function resetActiveTopic(): void {
  navigation.activeTopicID = null;
  navigation.activeFolderID = null;
  try {
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // localStorage недоступен — нечего чистить
  }
}
