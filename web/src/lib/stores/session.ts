// Сессия: логин/пароль → cookie; состояние при старте восстанавливается через GET /me.
// Навигация после смены сессии — в компонентах: logout()/401 → /login, вход → /;
// переходы на защищённые URL проверяют состояние сессии перед рендером.
// Здесь роутер не используется.
import { create } from 'zustand';

import { login as apiLogin, logout as apiLogout, me, register as apiRegister } from '../api/auth';
import type { User } from '../types/api';
import { resetFolders } from './folders';
import { resetActiveTopic } from './navigation';
import { resetNotes } from './notes';
import { resetNotifications } from './notifications';
import { resetTopics } from './topics';
import { resetUi } from './ui';

export type SessionState =
  | { state: 'loading' }
  | { state: 'guest' }
  | { state: 'authed'; user: User };

interface SessionStoreState {
  session: SessionState;
}

export const useSessionStore = create<SessionStoreState>()(() => ({
  session: { state: 'loading' },
}));

/** Инициализация один раз: повторные вызовы (например, из guard'ов) ждут тот же промис. */
let initPromise: Promise<void> | null = null;
export function initSession(): Promise<void> {
  if (initPromise === null) {
    initPromise = (async () => {
      try {
        applyAuthed(await me());
      } catch {
        applyGuest();
      }
    })();
  }
  return initPromise;
}

/** Дождаться инициализации сессии (guard'ы маршрутов). */
export function ensureSession(): Promise<void> {
  if (useSessionStore.getState().session.state !== 'loading') return Promise.resolve();
  return initSession();
}

export async function login(username: string, password: string): Promise<void> {
  applyAuthed(await apiLogin(username, password));
}

export async function register(username: string, password: string): Promise<void> {
  applyAuthed(await apiRegister(username, password));
}

export async function logout(): Promise<void> {
  try {
    await apiLogout();
  } finally {
    applyGuest();
  }
}

/** Сброс в гостя (например, по 401). */
export function clearSession(): void {
  applyGuest();
}

function applyAuthed(user: User): void {
  useSessionStore.setState({ session: { state: 'authed', user } });
}

function applyGuest(): void {
  useSessionStore.setState({ session: { state: 'guest' } });
  // Выход из аккаунта (logout / 401 / старт без сессии): сбрасываем загруженные
  // данные и активный топик, чтобы они не протекли между пользователями.
  resetActiveTopic();
  resetTopics();
  resetFolders();
  resetNotes();
  resetNotifications();
  resetUi();
}
