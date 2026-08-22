// Сессия: логин/пароль → cookie; состояние при старте восстанавливается через GET /me.
import { login as apiLogin, logout as apiLogout, me, register as apiRegister } from '../api/auth';
import type { User } from '../types/api';

export type SessionState =
  | { state: 'loading' }
  | { state: 'guest' }
  | { state: 'authed'; user: User };

export const session = $state<SessionState>({ state: 'loading' });

export async function initSession(): Promise<void> {
  try {
    const user = await me();
    applyAuthed(user);
  } catch {
    applyGuest();
  }
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
}
