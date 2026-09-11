// Тесты topics store: закреплённые топики идут первыми, закреп/открепление
// через PATCH §6. API — in-memory мок (client.ts в vitest DEV → mock).
import { beforeEach, describe, expect, it } from 'vitest';
import { request } from '../api/client';
import { resetMockStore, setMockDelay } from '../api/mock';
import type { Topic } from '../types/api';
import { resetActiveTopic } from './navigation';
import { loadTopics, setTopicPinned, useTopicsStore } from './topics';

/** Чтение zustand-состояния в синтаксисе прежнего $state-объекта. */
const topicsStore = {
  get topics() {
    return useTopicsStore.getState().topics;
  },
  get loading() {
    return useTopicsStore.getState().loading;
  },
  get error() {
    return useTopicsStore.getState().error;
  },
};

/** id топиков в порядке стора. */
function ids(): number[] {
  return topicsStore.topics.map((t) => t.id);
}

beforeEach(async () => {
  resetMockStore();
  setMockDelay(0);
  useTopicsStore.setState({ topics: [], loading: false, error: null });
  resetActiveTopic();
  await request('POST', '/api/v1/auth/register', { username: 'alice', password: 'password1' });
});

async function createTopicIn(name: string): Promise<Topic> {
  return request<Topic>('POST', '/api/v1/topics', { name });
}

describe('topics store', () => {
  it('ставит закреплённые топики первыми при загрузке', async () => {
    const first = await createTopicIn('Работа');
    const second = await createTopicIn('Личное');
    const third = await createTopicIn('Идеи');
    await request<Topic>('PATCH', `/api/v1/topics/${third.id}`, { pinned: true });

    await loadTopics();

    expect(ids()).toEqual([third.id, first.id, second.id]);
    expect(topicsStore.topics[0].pinned).toBe(true);
    expect(topicsStore.error).toBeNull();
  });

  it('закрепляет и открепляет топик, переставляя его в списке', async () => {
    const first = await createTopicIn('Работа');
    const second = await createTopicIn('Личное');
    await loadTopics();
    expect(ids()).toEqual([first.id, second.id]);

    await setTopicPinned(second.id, true);
    expect(ids()).toEqual([second.id, first.id]);
    expect(topicsStore.topics[0]).toMatchObject({ id: second.id, name: 'Личное', pinned: true });

    await setTopicPinned(second.id, false);
    expect(ids()).toEqual([first.id, second.id]);
    expect(topicsStore.topics[1].pinned).toBe(false);
  });

  it('пробрасывает ошибку и не меняет список при чужом/несуществующем топике', async () => {
    const first = await createTopicIn('Работа');
    await loadTopics();

    await expect(setTopicPinned(999, true)).rejects.toThrow('топик не найден');
    expect(ids()).toEqual([first.id]);
    expect(topicsStore.topics[0].pinned).toBe(false);
  });
});
