// Сессия: логин/пароль → cookie; состояние при старте восстанавливается через GET /me.
// Навигация после смены сессии — в компонентах (goto из $app/navigation):
// logout()/401 → /login, вход → /; переходы на защищённые URL выполняют
// guard'ы в load-функциях маршрутов. Здесь роутер не используется.
import { login as apiLogin, logout as apiLogout, me, register as apiRegister } from '../api/auth';
import { resetActiveTopic } from './navigation.svelte';
import { resetNotes } from './notes.svelte';
import { resetTopics } from './topics.svelte';
import type { User } from '../types/api';

export type SessionState =
  | { state: 'loading' }
  | { state: 'guest' }
  | { state: 'authed'; user: User };

export const session = $state<SessionState>({ state: 'loading' });

/** Инициализация один раз: повторные вызовы (например, из load-функций) ждут тот же промис. */
let initPromise: Promise<void> | null = null;
export function initSession(): Promise<void> {
  if (initPromise === null) {
    initPromise = (async () => {
      try {
        const user = await me();
        applyAuthed(user);
      } catch {
        applyGuest();
      }
    })();
  }
  return initPromise;
}

/** Дождаться инициализации сессии (guard'ы маршрутов). */
export function ensureSession(): Promise<void> {
  if (session.state !== 'loading') return Promise.resolve();
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
  session.state = 'authed';
  (session as { user: User }).user = user;
}

function applyGuest(): void {
  session.state = 'guest';
  (session as { user?: User }).user = undefined;
  // Выход из аккаунта (logout / 401 / старт без сессии): сбрасываем загруженные
  // данные и активный топик, чтобы они не протекли между пользователями.
  resetActiveTopic();
  resetTopics();
  resetNotes();
}
