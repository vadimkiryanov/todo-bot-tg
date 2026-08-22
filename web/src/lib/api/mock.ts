// In-memory мок REST API для разработки (без бэкенда).
// Контракт повторяет docs/BACKEND_API_PLAN.md §6 (auth / topics / notes),
// включая статусы ошибок и серверную сортировку заметок.
// Данные живут в localStorage браузера; в node (тесты) — в MemoryStorage.

import { ApiError } from './error';
import type { Note, NoteEntity, Priority, Topic, User } from '../types/api';
import { parseMarkdown } from '../utils/format';

const AUTH = '/api/v1/auth';
const TOPICS = '/api/v1/topics';
const NOTES = '/api/v1/notes';

// ---------------------------------------------------------------------------
// Хранилище (localStorage в браузере, MemoryStorage в тестах)

interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

class MemoryStorage implements KV {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}

const storage: KV =
  typeof localStorage !== 'undefined'
    ? {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: (key) => localStorage.removeItem(key),
        keys: () => Object.keys(localStorage),
      }
    : new MemoryStorage();

// ---------------------------------------------------------------------------
// Записи мока (сессия и данные по пользователю)

interface UserRecord {
  id: number;
  username: string;
  password: string; // мок: пароль в открытом виде — только для разработки
}

interface TopicRecord {
  id: number;
  name: string;
}

interface NoteRecord {
  id: number;
  topic_id: number;
  text: string;
  entities: NoteEntity[];
  priority: Priority;
  done: boolean;
  pinned: boolean;
  archived: boolean;
  created_at: string;
}

const K_USERS = 'todo.mock.users';
const K_SESSION = 'todo.mock.session';
const K_TOPICS = (userId: number) => `todo.mock.topics.${userId}`;
const K_NOTES = (userId: number) => `todo.mock.notes.${userId}`;
const K_TOPIC_SEQ = (userId: number) => `todo.mock.seq.topics.${userId}`;
const K_NOTE_SEQ = (userId: number) => `todo.mock.seq.notes.${userId}`;

// ---------------------------------------------------------------------------
// Вспомогательное

let delayMs = 150;
let nextUserID = 1;

/** Управление для тестов. */
export function setMockDelay(ms: number): void {
  delayMs = ms;
}

/** Полная очистка мока (тесты). */
export function resetMockStore(): void {
  for (const key of storage.keys()) {
    if (key.startsWith('todo.mock.')) {
      storage.removeItem(key);
    }
  }
  nextUserID = 1;
}

function readJSON<T>(key: string, fallback: T): T {
  const raw = storage.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  storage.setItem(key, JSON.stringify(value));
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs + Math.random() * 100));
}

function users(): UserRecord[] {
  return readJSON<UserRecord[]>(K_USERS, []);
}

function currentUser(): UserRecord | null {
  const session = readJSON<{ userId: number } | null>(K_SESSION, null);
  if (session === null) return null;
  return users().find((u) => u.id === session.userId) ?? null;
}

function requireUser(): UserRecord {
  const user = currentUser();
  if (user === null) {
    throw new ApiError(401, 'не авторизован');
  }
  return user;
}

function topicsOf(userId: number): TopicRecord[] {
  return readJSON<TopicRecord[]>(K_TOPICS(userId), []);
}

function notesOf(userId: number): NoteRecord[] {
  return readJSON<NoteRecord[]>(K_NOTES(userId), []);
}

function seq(key: string): number {
  const value = readJSON<number>(key, 0);
  writeJSON(key, value + 1);
  return value + 1;
}

function toUser(user: UserRecord): User {
  return { id: user.id, username: user.username };
}

function toTopic(rec: TopicRecord, noteCount: number): Topic {
  return { id: rec.id, name: rec.name, note_count: noteCount };
}

function toNote(rec: NoteRecord): Note {
  return {
    id: rec.id,
    text: rec.text,
    entities: rec.entities,
    priority: rec.priority,
    done: rec.done,
    pinned: rec.pinned,
    archived: rec.archived,
    created_at: rec.created_at,
  };
}

/** Сортировка как у бота: pinned → High → Medium → None → Low, done в конце. */
function sortNotes(notes: NoteRecord[]): NoteRecord[] {
  const priorityRank: Record<Priority, number> = {
    high: 0,
    medium: 1,
    none: 2,
    low: 3,
  };
  return [...notes].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const pa = priorityRank[a.priority];
    const pb = priorityRank[b.priority];
    if (pa !== pb) return pa - pb;
    return a.id - b.id;
  });
}

// ---------------------------------------------------------------------------
// Валидация (как в BACKEND_API_PLAN §4)

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

function validateCredentials(username: unknown, password: unknown): void {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new ApiError(400, 'username: 3–32 символа, только a-z, 0-9, _');
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new ApiError(400, 'пароль: минимум 8 символов');
  }
}

// ---------------------------------------------------------------------------
// Роутер

export async function mockRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  await delay();

  const [base, query = ''] = path.split('?');
  const search = new URLSearchParams(query);

  // --- auth ---
  if (base === `${AUTH}/register` && method === 'POST') {
    return mockRegister(body) as T;
  }
  if (base === `${AUTH}/login` && method === 'POST') {
    return mockLogin(body) as T;
  }
  if (base === `${AUTH}/logout` && method === 'POST') {
    mockLogout();
    return undefined as T;
  }
  if (base === '/api/v1/me' && method === 'GET') {
    return { user: toUser(requireUser()) } as T;
  }

  // --- topics ---
  if (base === TOPICS && method === 'GET') {
    const user = requireUser();
    const counts = new Map<number, number>();
    for (const note of notesOf(user.id)) {
      counts.set(note.topic_id, (counts.get(note.topic_id) ?? 0) + 1);
    }
    return topicsOf(user.id).map((t) => toTopic(t, counts.get(t.id) ?? 0)) as T;
  }
  if (base === TOPICS && method === 'POST') {
    return mockCreateTopic(body) as T;
  }
  const topicMatch = /^\/api\/v1\/topics\/(\d+)$/.exec(base);
  if (topicMatch && method === 'PATCH') {
    return mockRenameTopic(Number(topicMatch[1]), body) as T;
  }
  if (topicMatch && method === 'DELETE') {
    mockDeleteTopic(Number(topicMatch[1]));
    return undefined as T;
  }

  // --- notes ---
  if (base === NOTES && method === 'GET') {
    if (search.get('archived') === 'true') {
      return mockListArchived() as T;
    }
    const topicId = Number(search.get('topic_id'));
    if (!Number.isInteger(topicId)) {
      throw new ApiError(400, 'topic_id обязателен');
    }
    return mockListNotes(topicId) as T;
  }
  if (base === NOTES && method === 'POST') {
    return mockCreateNote(body) as T;
  }
  const noteMatch = /^\/api\/v1\/notes\/(\d+)$/.exec(base);
  if (noteMatch && method === 'PATCH') {
    return mockUpdateNote(Number(noteMatch[1]), body) as T;
  }
  if (noteMatch && method === 'DELETE') {
    mockDeleteNote(Number(noteMatch[1]));
    return undefined as T;
  }

  throw new ApiError(404, 'не найдено');
}

// ---------------------------------------------------------------------------
// Auth

function mockRegister(body: unknown): { user: User } {
  const { username, password } = asObject(body);
  validateCredentials(username, password);

  const all = users();
  if (all.some((u) => u.username === username)) {
    throw new ApiError(409, 'этот логин уже занят');
  }
  const user: UserRecord = {
    id: nextUserID++,
    username: username as string,
    password: password as string,
  };
  all.push(user);
  writeJSON(K_USERS, all);
  writeJSON(K_SESSION, { userId: user.id });
  return { user: toUser(user) };
}

function mockLogin(body: unknown): { user: User } {
  const { username, password } = asObject(body);
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new ApiError(400, 'username и password обязательны');
  }
  const user = users().find(
    (u) => u.username === username && u.password === password,
  );
  if (user === undefined) {
    throw new ApiError(401, 'неверный логин или пароль');
  }
  writeJSON(K_SESSION, { userId: user.id });
  return { user: toUser(user) };
}

function mockLogout(): void {
  storage.removeItem(K_SESSION);
}

// ---------------------------------------------------------------------------
// Topics

function mockCreateTopic(body: unknown): Topic {
  const user = requireUser();
  const { name } = asObject(body);
  if (typeof name !== 'string' || name.trim() === '') {
    throw new ApiError(400, 'название обязательно');
  }
  const trimmed = name.trim();
  const all = topicsOf(user.id);
  if (all.some((t) => t.name === trimmed)) {
    throw new ApiError(409, 'топик с таким названием уже существует');
  }
  const topic: TopicRecord = { id: seq(K_TOPIC_SEQ(user.id)), name: trimmed };
  all.push(topic);
  writeJSON(K_TOPICS(user.id), all);
  return { id: topic.id, name: topic.name, note_count: 0 };
}

function mockRenameTopic(topicId: number, body: unknown): Topic {
  const user = requireUser();
  const { name } = asObject(body);
  if (typeof name !== 'string' || name.trim() === '') {
    throw new ApiError(400, 'название обязательно');
  }
  const trimmed = name.trim();
  const all = topicsOf(user.id);
  const topic = all.find((t) => t.id === topicId);
  if (topic === undefined) {
    throw new ApiError(404, 'топик не найден');
  }
  if (all.some((t) => t.id !== topicId && t.name === trimmed)) {
    throw new ApiError(409, 'топик с таким названием уже существует');
  }
  topic.name = trimmed;
  writeJSON(K_TOPICS(user.id), all);
  const noteCount = notesOf(user.id).filter((n) => n.topic_id === topicId).length;
  return toTopic(topic, noteCount);
}

function mockDeleteTopic(topicId: number): void {
  const user = requireUser();
  const topics = topicsOf(user.id).filter((t) => t.id !== topicId);
  if (topics.length === topicsOf(user.id).length) {
    throw new ApiError(404, 'топик не найден');
  }
  writeJSON(K_TOPICS(user.id), topics);
  writeJSON(
    K_NOTES(user.id),
    notesOf(user.id).filter((n) => n.topic_id !== topicId),
  );
}

// ---------------------------------------------------------------------------
// Notes

function mockListNotes(topicId: number): Note[] {
  const user = requireUser();
  const notes = notesOf(user.id).filter(
    (n) => n.topic_id === topicId && !n.archived,
  );
  return sortNotes(notes).map(toNote);
}

function mockListArchived(): Note[] {
  const user = requireUser();
  const notes = notesOf(user.id).filter((n) => n.archived);
  return sortNotes(notes).map(toNote);
}

function mockCreateNote(body: unknown): Note {
  const user = requireUser();
  const { topic_id, text } = asObject(body);
  if (typeof topic_id !== 'number' || !Number.isInteger(topic_id)) {
    throw new ApiError(400, 'topic_id обязателен');
  }
  if (typeof text !== 'string' || text.trim() === '') {
    throw new ApiError(400, 'текст обязателен');
  }
  if (!topicsOf(user.id).some((t) => t.id === topic_id)) {
    throw new ApiError(404, 'топик не найден');
  }
  const parsed = parseMarkdown(text.trim());
  const note: NoteRecord = {
    id: seq(K_NOTE_SEQ(user.id)),
    topic_id,
    text: parsed.text,
    entities: parsed.entities,
    priority: 'none',
    done: false,
    pinned: false,
    archived: false,
    created_at: new Date().toISOString(),
  };
  const all = notesOf(user.id);
  all.push(note);
  writeJSON(K_NOTES(user.id), all);
  return toNote(note);
}

function mockUpdateNote(noteId: number, body: unknown): Note {
  const user = requireUser();
  const patch = asObject(body);
  const all = notesOf(user.id);
  const note = all.find((n) => n.id === noteId);
  if (note === undefined) {
    throw new ApiError(404, 'заметка не найдена');
  }
  if ('text' in patch) {
    if (typeof patch.text !== 'string' || patch.text.trim() === '') {
      throw new ApiError(400, 'текст обязателен');
    }
    const parsed = parseMarkdown(patch.text.trim());
    note.text = parsed.text;
    note.entities = parsed.entities;
  }
  if ('done' in patch) {
    if (typeof patch.done !== 'boolean') {
      throw new ApiError(400, 'done должен быть true/false');
    }
    note.done = patch.done;
  }
  if ('priority' in patch) {
    if (!['none', 'low', 'medium', 'high'].includes(patch.priority as string)) {
      throw new ApiError(400, 'некорректный priority');
    }
    note.priority = patch.priority as Priority;
  }
  if ('pinned' in patch) {
    if (typeof patch.pinned !== 'boolean') {
      throw new ApiError(400, 'pinned должен быть true/false');
    }
    note.pinned = patch.pinned;
  }
  if ('archived' in patch) {
    if (typeof patch.archived !== 'boolean') {
      throw new ApiError(400, 'archived должен быть true/false');
    }
    note.archived = patch.archived;
  }
  writeJSON(K_NOTES(user.id), all);
  return toNote(note);
}

function mockDeleteNote(noteId: number): void {
  const user = requireUser();
  const all = notesOf(user.id);
  const filtered = all.filter((n) => n.id !== noteId);
  if (filtered.length === all.length) {
    throw new ApiError(404, 'заметка не найдена');
  }
  writeJSON(K_NOTES(user.id), filtered);
}

// ---------------------------------------------------------------------------

function asObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'некорректное тело запроса');
  }
  return body as Record<string, unknown>;
}
