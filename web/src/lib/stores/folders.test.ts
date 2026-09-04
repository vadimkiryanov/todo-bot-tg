// Тесты folders store: хлебные крошки, папки уровня, CRUD и каскад при удалении.
// API — in-memory мок (client.ts в vitest DEV → mock).
import { beforeEach, describe, expect, it } from 'vitest';
import { request } from '../api/client';
import { resetMockStore, setMockDelay } from '../api/mock';
import { loadNotes, notesStore, resetNotes } from './notes.svelte';
import { navigation, setActiveFolder, setActiveTopic } from './navigation.svelte';
import {
  createFolder,
  deleteFolder,
  folderChain,
  foldersStore,
  levelFolders,
  loadFolders,
  renameFolder,
  resetFolders,
  treeFolders,
} from './folders.svelte';
import type { Topic } from '../types/api';

beforeEach(() => {
  resetMockStore();
  setMockDelay(0);
  resetFolders();
  resetNotes();
});

async function setupTopic(): Promise<number> {
  await request('POST', '/api/v1/auth/register', {
    username: 'alice',
    password: 'password123',
  });
  const topic = await request<Topic>('POST', '/api/v1/topics', { name: 'Работа' });
  setActiveTopic(topic.id);
  await loadFolders(topic.id);
  return topic.id;
}

describe('folders store', () => {
  it('создаёт папку на текущем уровне и строит цепочку крошек', async () => {
    const topicId = await setupTopic();

    // В корне создаётся A; уровень — корневые папки.
    await createFolder('A');
    expect(foldersStore.all).toHaveLength(1);
    expect(levelFolders().map((f) => f.name)).toEqual(['A']);
    expect(folderChain()).toHaveLength(0);

    // Вход в A: B создаётся внутри A; вход в B — цепочка A › B.
    setActiveFolder(foldersStore.all[0].id);
    await createFolder('B');
    setActiveFolder(foldersStore.all[1].id);

    expect(levelFolders().map((f) => f.name)).toEqual([]);
    expect(folderChain().map((f) => f.name)).toEqual(['A', 'B']);
    expect(foldersStore.all).toHaveLength(2);
    expect(foldersStore.all[1].parent_folder_id).toBe(foldersStore.all[0].id);
    expect(foldersStore.all[1].topic_id).toBe(topicId);
  });

  it('дерево папок: обход в глубину с глубинами и ветками', async () => {
    await setupTopic();
    await createFolder('A'); // корень
    const aId = foldersStore.all[0].id;
    setActiveFolder(aId);
    await createFolder('B'); // внутри A
    await createFolder('C'); // внутри A
    setActiveFolder(foldersStore.all[1].id);
    await createFolder('D'); // внутри B
    setActiveFolder(null);
    await createFolder('E'); // корень

    const tree = treeFolders();
    expect(tree.map((n) => `${'  '.repeat(n.depth)}${n.folder.name}`)).toEqual([
      'A',
      '  B',
      '    D',
      '  C',
      'E',
    ]);
    // Ветки: A и E — корневые (без линий); B и C — дети A (у A есть брат
    // ниже → вертикальная линия); D — последний ребёнок B.
    expect(tree.map((n) => n.continues)).toEqual([[], [true], [true, true], [true], []]);
    expect(tree.map((n) => n.isLast)).toEqual([false, false, true, true, true]);
  });

  it('переименование обновляет папку в сторе', async () => {
    await setupTopic();
    await createFolder('A');

    await renameFolder(foldersStore.all[0].id, 'Б');

    expect(foldersStore.all[0].name).toBe('Б');
  });

  it('удаление активной папки сбрасывает навигацию в корень', async () => {
    await setupTopic();
    await createFolder('A');
    setActiveFolder(foldersStore.all[0].id);
    await createFolder('B');

    await deleteFolder(foldersStore.all[0].id);

    expect(foldersStore.all).toHaveLength(0);
    expect(navigation.activeFolderID).toBeNull();
  });

  it('удаление предка сбрасывает навигацию в корень', async () => {
    await setupTopic();
    await createFolder('A');
    const aId = foldersStore.all[0].id;
    setActiveFolder(aId);
    await createFolder('B');
    setActiveFolder(foldersStore.all[1].id);

    await deleteFolder(aId);

    expect(navigation.activeFolderID).toBeNull();
    expect(foldersStore.all).toHaveLength(0);
  });

  it('удаление другой папки не трогает активную', async () => {
    await setupTopic();
    await createFolder('A');
    await createFolder('Б');
    const aId = foldersStore.all[0].id;
    const bId = foldersStore.all[1].id;
    setActiveFolder(aId);

    await deleteFolder(bId);

    expect(navigation.activeFolderID).toBe(aId);
    expect(foldersStore.all.map((f) => f.id)).toEqual([aId]);
  });

  it('удаление папки каскадно удаляет заметки внутри (через сервер)', async () => {
    const topicId = await setupTopic();
    await createFolder('A');
    const folderId = foldersStore.all[0].id;

    // Заметка в папке: вызываем API напрямую, стор заметок не задействован.
    await request('POST', '/api/v1/notes', {
      topic_id: topicId,
      folder_id: folderId,
      text: 'в папке',
    });

    await deleteFolder(folderId);

    await loadNotes(topicId);
    expect(notesStore.notes).toHaveLength(0);
  });

  it('смена топика очищает папки и сбрасывает активную', async () => {
    await setupTopic();
    await createFolder('A');
    setActiveFolder(foldersStore.all[0].id);
    expect(foldersStore.all).toHaveLength(1);

    const second = await request<Topic>('POST', '/api/v1/topics', { name: 'Личное' });
    setActiveTopic(second.id);
    await loadFolders(second.id);

    expect(navigation.activeFolderID).toBeNull();
    expect(foldersStore.all).toHaveLength(0);
  });
});
