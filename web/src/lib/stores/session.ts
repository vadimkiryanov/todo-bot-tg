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
import { resetToasts, toastSuccess } from './toast';
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

/** Вход: ошибки показывает форма (инлайн), здесь — только успех. */
export async function login(username: string, password: string): Promise<void> {
  applyAuthed(await apiLogin(username, password));
  toastSuccess('Вы вошли');
}

/** Регистрация: ошибки показывает форма, здесь — только успех. */
export async function register(username: string, password: string): Promise<void> {
  applyAuthed(await apiRegister(username, password));
  toastSuccess('Аккаунт создан');
}

export async function logout(): Promise<void> {
  let ok = false;
  try {
    await apiLogout();
    ok = true;
  } finally {
    applyGuest();
  }
  if (ok) toastSuccess('Вы вышли');
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
  // Тосты — тоже: сообщения прошлой сессии не должны всплывать на экране входа
  // (успешный logout показывает своё «Вы вышли» уже после сброса).
  resetActiveTopic();
  resetTopics();
  resetFolders();
  resetNotes();
  resetNotifications();
  resetUi();
  resetToasts();
}
