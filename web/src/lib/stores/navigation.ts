// Активный топик и активная папка: выбор между сессиями, сохраняется в localStorage.
// Экраны (login/chat/archive) определяет URL-роутер — здесь их нет.
import { create } from 'zustand';

import type { Topic } from '../types/api';

const ACTIVE_KEY = 'todo.activeTopicID';

interface NavigationState {
  activeTopicID: number | null;
  activeFolderID: number | null;
  /** Куда едет свайпер (свайп-жест): таб островка подсвечивается сразу при
      отпускании, хотя контент и активный топик переключаются после доводки. */
  pendingTopicID: number | null;
}

export const useNavigationStore = create<NavigationState>()(() => ({
  activeTopicID: null,
  activeFolderID: null,
  pendingTopicID: null,
}));

export function setActiveTopic(id: number): void {
  useNavigationStore.setState({
    activeTopicID: id,
    pendingTopicID: null,
    // Смена топика сбрасывает навигацию по папкам в корень.
    activeFolderID: null,
  });
  try {
    localStorage.setItem(ACTIVE_KEY, String(id));
  } catch {
    // localStorage недоступен — выбор не сохранится между сессиями
  }
}

export function setActiveFolder(id: number | null): void {
  useNavigationStore.setState({ activeFolderID: id });
}

/** Восстановить активный топик: последний из localStorage или первый в списке. */
export function restoreActiveTopic(topics: Topic[]): void {
  const navigation = useNavigationStore.getState();
  if (topics.length === 0) {
    useNavigationStore.setState({ activeTopicID: null, activeFolderID: null });
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
  useNavigationStore.setState({
    activeTopicID: exists && saved !== null ? saved : topics[0].id,
    pendingTopicID: null,
    activeFolderID: null,
  });
}

/** Сброс активного топика и папки (выход из аккаунта). */
export function resetActiveTopic(): void {
  useNavigationStore.setState({
    activeTopicID: null,
    pendingTopicID: null,
    activeFolderID: null,
  });
  try {
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // localStorage недоступен — нечего чистить
  }
}
