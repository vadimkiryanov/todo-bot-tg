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
  clearNoteHighlight,
  clearReminder,
  createNote,
  doneStore,
  isNotesCached,
  loadArchived,
  loadDone,
  loadNotes,
  moveNote,
  notesStore,
  preloadTopicNeighbors,
  removeDoneNote,
  removeNote,
  resetNotes,
  saveText,
  setPriority,
  setReminder,
  toggleDone,
  togglePin,
  unarchiveNote,
  undoneNote,
} from './notes.svelte';

beforeEach(() => {
  resetMockStore();
  setMockDelay(0);
  resetNotes();
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

    // Свежие сверху (серверная сортировка).
    expect(notesStore.notes.map((n) => n.text)).toEqual(['вторая', 'первая']);
  });

  it('createNote подсвечивает созданную заметку (highlightedId)', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    // Стор — модульное состояние: сбрасываем подсветку от предыдущих тестов.
    clearNoteHighlight();
    expect(notesStore.highlightedId).toBeNull();

    await createNote('новая');

    const created = notesStore.notes[0];
    expect(notesStore.highlightedId).toBe(created.id);

    clearNoteHighlight();
    expect(notesStore.highlightedId).toBeNull();
  });

  it('выполненная заметка исчезает из списка и попадает на склад (doneStore)', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('первая');
    await createNote('вторая');

    // Свежие сверху: notes[0] = 'вторая'.
    await toggleDone(notesStore.notes[0]);

    // В основном списке выполненных больше нет (как на бэкенде).
    expect(notesStore.notes.map((n) => n.text)).toEqual(['первая']);
    expect(notesStore.notes.some((n) => n.done)).toBe(false);

    await loadDone();
    expect(doneStore.notes.map((n) => n.text)).toEqual(['вторая']);
    expect(doneStore.notes[0].done).toBe(true);
  });

  it('loadDone возвращает выполненные из всех топиков', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('обычная');
    await createNote('сделано');
    await toggleDone(notesStore.notes[0]); // 'сделано'

    await loadDone();
    expect(doneStore.notes.map((n) => n.text)).toEqual(['сделано']);

    // Выполненные не пересекаются с архивом.
    await loadArchived();
    expect(archivedStore.notes).toHaveLength(0);
  });

  it('undoneNote убирает заметку со склада и возвращает в активный список', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('сделано');
    await toggleDone(notesStore.notes[0]);
    await loadDone();
    expect(doneStore.notes).toHaveLength(1);

    await undoneNote(doneStore.notes[0]);
    expect(doneStore.notes).toHaveLength(0);

    await loadNotes(topicId);
    expect(notesStore.notes.map((n) => n.text)).toEqual(['сделано']);
    expect(notesStore.notes[0].done).toBe(false);
  });

  it('removeDoneNote удаляет заметку со склада', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('удалить');
    await toggleDone(notesStore.notes[0]);
    await loadDone();
    expect(doneStore.notes).toHaveLength(1);

    await removeDoneNote(doneStore.notes[0]);
    expect(doneStore.notes).toHaveLength(0);
  });

  it('removeDoneNote откатывается при ошибке', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('удалить');
    await toggleDone(notesStore.notes[0]);
    await loadDone();
    const count = doneStore.notes.length;

    // Заметка с несуществующим id — сервер вернёт 404.
    const ghost = { ...doneStore.notes[0], id: 9999 };
    await expect(removeDoneNote(ghost)).rejects.toThrow();

    expect(doneStore.notes).toHaveLength(count);
  });

  it('высокий приоритет поднимает заметку наверх', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('обычная');
    await createNote('важная');

    // Свежие сверху: notes = ['важная', 'обычная']; поднимаем 'обычную' → high.
    await setPriority(notesStore.notes[1], 'high');

    expect(notesStore.notes.map((n) => n.text)).toEqual(['обычная', 'важная']);
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

    // Свежие сверху: notes = ['вторая', 'первая']; закрепляем 'первую'.
    await togglePin(notesStore.notes[1]);

    expect(notesStore.notes.map((n) => n.text)).toEqual(['первая', 'вторая']);
    expect(notesStore.notes[0].pinned).toBe(true);

    // Открепление возвращает порядок (свежие сверху).
    await togglePin(notesStore.notes[0]);
    expect(notesStore.notes.map((n) => n.text)).toEqual(['вторая', 'первая']);
    expect(notesStore.notes[0].pinned).toBe(false);
  });

  it('архивированная заметка исчезает из топика и попадает в архив', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('первая');
    await createNote('в архив');

    // Свежие сверху: notes[0] = 'в архив'.
    await archiveNote(notesStore.notes[0]);

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

  it('resetNotes очищает активные, архивные и выполненные заметки (выход из аккаунта)', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('первая');
    await archiveNote(notesStore.notes[0]);
    await createNote('сделано');
    await toggleDone(notesStore.notes[0]);
    await loadArchived();
    await loadDone();
    expect(notesStore.notes).toHaveLength(0);
    expect(archivedStore.notes).toHaveLength(1);
    expect(doneStore.notes).toHaveLength(1);

    resetNotes();

    expect(notesStore.notes).toHaveLength(0);
    expect(archivedStore.notes).toHaveLength(0);
    expect(doneStore.notes).toHaveLength(0);
    expect(notesStore.error).toBeNull();
    expect(archivedStore.error).toBeNull();
    expect(doneStore.error).toBeNull();
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
    await loadDone();
    expect(doneStore.notes[0].reminder_at).toBeNull();
  });

  it('кеш контекстов: повторное открытие топика показывает список без спиннера', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('первая');
    expect(notesStore.notes).toHaveLength(1);

    // Уходим в другой топик (тоже загружаем — его кеш пуст).
    const second = await request<Topic>('POST', '/api/v1/topics', { name: 'Личное' });
    setActiveTopic(second.id);
    await loadNotes(second.id);
    expect(notesStore.notes).toHaveLength(0);

    // Возврат в первый топик: кеш показывается сразу (loading не включается).
    setActiveTopic(topicId);
    const p = loadNotes(topicId);
    expect(notesStore.loading).toBe(false);
    expect(notesStore.notes).toHaveLength(1);
    await p;
    expect(notesStore.notes.map((n) => n.text)).toEqual(['первая']);
  });

  it('предзагрузка соседей кеширует заметки соседних топиков', async () => {
    const a = await setupTopic(); // топик 1 (активный)
    const b = await request<Topic>('POST', '/api/v1/topics', { name: 'B' });
    const c = await request<Topic>('POST', '/api/v1/topics', { name: 'C' });

    await loadNotes(a);
    await createNote('в A');

    // Заметка в B (создаётся через активный топик B).
    setActiveTopic(b.id);
    await loadNotes(b.id);
    await createNote('в B');

    // Возврат в A — после этого подгружаем соседей. B уже закеширован
    // (посещался), C — ещё нет: предзагрузка должна догрузить C.
    setActiveTopic(a);
    await loadNotes(a);
    expect(isNotesCached(b.id)).toBe(true);
    expect(isNotesCached(c.id)).toBe(false);

    await preloadTopicNeighbors(a, [b.id, c.id]);

    expect(isNotesCached(a)).toBe(true);
    expect(isNotesCached(b.id)).toBe(true);
    expect(isNotesCached(c.id)).toBe(true);

    // Кеш B действительно содержит заметки B.
    setActiveTopic(b.id);
    await loadNotes(b.id);
    expect(notesStore.notes.map((n) => n.text)).toEqual(['в B']);
  });

  it('saveText правит текст в архиве', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('в архив');
    await archiveNote(notesStore.notes[0]);
    await loadArchived();
    const archived = archivedStore.notes[0];

    await saveText(archived, 'исправлено');

    expect(archivedStore.notes[0].text).toBe('исправлено');
    expect(notesStore.notes).toHaveLength(0);
  });

  it('saveText правит текст на складе выполненных', async () => {
    const topicId = await setupTopic();
    await loadNotes(topicId);
    await createNote('сделать');
    await toggleDone(notesStore.notes[0]);
    await loadDone();
    const done = doneStore.notes[0];

    await saveText(done, 'сделано с пометкой');

    expect(doneStore.notes[0].text).toBe('сделано с пометкой');
  });
});
