// Тесты notes store: создание, серверная сортировка, оптимистичные откаты.
// API — in-memory мок (client.ts в vitest DEV → mock).
import { beforeEach, describe, expect, it } from 'vitest';
import { request } from '../api/client';
import { resetMockStore, setMockDelay } from '../api/mock';
import type { Folder, Priority, Topic } from '../types/api';
import { setActiveFolder, setActiveTopic } from './navigation.svelte';
import {
  archivedStore,
  archiveNote,
  clearReminder,
  createNote,
  loadArchived,
  loadNotes,
  moveNote,
  notesStore,
  removeNote,
  resetNotes,
  setPriority,
  setReminder,
  toggleDone,
  togglePin,
  unarchiveNote,
} from './notes.svelte';

beforeEach(() => {
  resetMockStore();
  setMockDelay(0);
});

async function setupTopic(): Promise<number> {
  await request('POST', '/api/v1/auth/register', {
    username: 'alice',
    password: 'password1',
  });
  const topic = await request<Topic>('POST', '/api/v1/topics', { name: 'Работа' });
  setActiveTopic(topic.id);
  return topic.id;
}

async function createFolderIn(topicId: number, name: string): Promise<Folder> {
  return request<Folder>('POST', '/api/v1/folders', { topic_id: topicId, name });
}

describe('notes store', () => {
  it('создаёт заметку в активном топике', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('первая');
    await createNote('вторая');

    expect(notesStore.notes.map((n) => n.text)).toEqual(['первая', 'вторая']);
  });

  it('выполненная заметка уезжает в конец (серверная сортировка)', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('первая');
    await createNote('вторая');

    await toggleDone(notesStore.notes[0]);

    expect(notesStore.notes.map((n) => n.text)).toEqual(['вторая', 'первая']);
    expect(notesStore.notes[1].done).toBe(true);
  });

  it('высокий приоритет поднимает заметку наверх', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('обычная');
    await createNote('важная');

    await setPriority(notesStore.notes[1], 'high');

    expect(notesStore.notes.map((n) => n.text)).toEqual(['важная', 'обычная']);
    expect(notesStore.notes[0].priority).toBe('high');
  });

  it('откатывает мутацию при ошибке сервера', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('первая');

    const before = notesStore.notes;
    await expect(
      setPriority(notesStore.notes[0], 'invalid' as Priority),
    ).rejects.toThrow();

    expect(notesStore.notes).toEqual(before);
    expect(notesStore.notes[0].priority).toBe('none');
  });

  it('откатывает удаление при ошибке', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('первая');
    await createNote('вторая');
    const count = notesStore.notes.length;

    // Заметка с несуществующим id — сервер вернёт 404.
    const ghost = { ...notesStore.notes[0], id: 9999 };
    await expect(removeNote(ghost)).rejects.toThrow();

    expect(notesStore.notes).toHaveLength(count);
  });

  it('закреплённая заметка поднимается наверх (серверная сортировка)', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('первая');
    await createNote('вторая');

    await togglePin(notesStore.notes[1]);

    expect(notesStore.notes.map((n) => n.text)).toEqual(['вторая', 'первая']);
    expect(notesStore.notes[0].pinned).toBe(true);

    // Открепление возвращает порядок.
    await togglePin(notesStore.notes[0]);
    expect(notesStore.notes[0].pinned).toBe(false);
  });

  it('архивированная заметка исчезает из топика и попадает в архив', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('первая');
    await createNote('в архив');

    await archiveNote(notesStore.notes[1]);

    expect(notesStore.notes.map((n) => n.text)).toEqual(['первая']);

    await loadArchived();
    expect(archivedStore.notes.map((n) => n.text)).toEqual(['в архив']);
  });

  it('возврат из архива убирает заметку из архива', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('в архив');
    await archiveNote(notesStore.notes[0]);
    await loadArchived();

    const archived = archivedStore.notes[0];
    await unarchiveNote(archived);

    expect(archivedStore.notes).toHaveLength(0);
    await loadNotes(topicId);
    expect(notesStore.notes.map((n) => n.text)).toEqual(['в архив']);
  });

  it('resetNotes очищает активные и архивные заметки (выход из аккаунта)', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('первая');
    await archiveNote(notesStore.notes[0]);
    await loadArchived();
    expect(notesStore.notes).toHaveLength(0);
    expect(archivedStore.notes).toHaveLength(1);

    resetNotes();

    expect(notesStore.notes).toHaveLength(0);
    expect(archivedStore.notes).toHaveLength(0);
    expect(notesStore.error).toBeNull();
    expect(archivedStore.error).toBeNull();
  });

  it('создаёт заметку в активной папке (folder_id заполнен)', async () => {
    const topicId = await setupTopic();
    const folder = await createFolderIn(topicId, 'Проект');
    setActiveFolder(folder.id);

    await loadNotes(topicId, folder.id);
    await createNote('в папке');

    expect(notesStore.notes).toHaveLength(1);
    expect(notesStore.notes[0].folder_id).toBe(folder.id);
    expect(notesStore.notes[0].topic_id).toBe(topicId);
  });

  it('moveNote переносит заметку в папку и обновляет список', async () => {
    const topicId = await setupTopic();
    const folder = await createFolderIn(topicId, 'Проект');
    await loadNotes(topicId);
    await createNote('первая');

    const note = notesStore.notes[0];
    await moveNote(note, folder.id);

    // Список корня перезагружен — заметка осталась (все заметки топика),
    // но её папка обновилась.
    expect(notesStore.notes[0].folder_id).toBe(folder.id);
  });

  it('moveNote убирает заметку из списка папки при переносе в корень', async () => {
    const topicId = await setupTopic();
    const folder = await createFolderIn(topicId, 'Проект');
    setActiveFolder(folder.id);
    await loadNotes(topicId, folder.id);
    await createNote('в папке');

    const note = notesStore.notes[0];
    await moveNote(note, null);

    // Активная папка != целевой (null) — список перезагружен, заметка ушла.
    expect(notesStore.notes).toHaveLength(0);
  });

  it('setReminder ставит напоминание (once в будущем)', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('напомнить');

    const at = new Date(Date.now() + 3600_000).toISOString();
    await setReminder(notesStore.notes[0], at, 'once');

    const note = notesStore.notes[0];
    expect(note.reminder_at).toBe(at);
    expect(note.reminder_repeat).toBe('once');
  });

  it('setReminder откатывается при ошибке (once в прошлом)', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('напомнить');

    const before = notesStore.notes;
    const past = new Date(Date.now() - 3600_000).toISOString();
    await expect(setReminder(notesStore.notes[0], past, 'once')).rejects.toThrow();

    expect(notesStore.notes).toEqual(before);
    expect(notesStore.notes[0].reminder_at).toBeNull();
  });

  it('clearReminder снимает напоминание', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('напомнить');

    const at = new Date(Date.now() + 3600_000).toISOString();
    await setReminder(notesStore.notes[0], at, 'daily');
    await clearReminder(notesStore.notes[0]);

    expect(notesStore.notes[0].reminder_at).toBeNull();
    expect(notesStore.notes[0].reminder_repeat).toBe('once');
  });

  it('выполненная заметка сбрасывает напоминание', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('напомнить');

    const at = new Date(Date.now() + 3600_000).toISOString();
    await setReminder(notesStore.notes[0], at, 'once');
    await toggleDone(notesStore.notes[0]);

    // Go-сервис MarkDone → ClearReminder: выполненная задача не напоминает.
    expect(notesStore.notes.find((n) => n.done)?.reminder_at).toBeNull();
  });
});
