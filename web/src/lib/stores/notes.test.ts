// Тесты notes store: создание, серверная сортировка, оптимистичные откаты.
// API — in-memory мок (client.ts в vitest DEV → mock).
import { beforeEach, describe, expect, it } from 'vitest';
import { request } from '../api/client';
import { resetMockStore, setMockDelay } from '../api/mock';
import type { Priority, Topic } from '../types/api';
import { setActiveTopic } from './navigation.svelte';
import {
  archivedStore,
  archiveNote,
  createNote,
  loadArchived,
  loadNotes,
  notesStore,
  removeNote,
  setPriority,
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
});
