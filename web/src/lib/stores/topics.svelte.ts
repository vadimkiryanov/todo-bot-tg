// Топики: загрузка при старте, создание/переименование/удаление, авто-выбор активного.
import {
  createTopic as apiCreateTopic,
  deleteTopic as apiDeleteTopic,
  listTopics,
  renameTopic as apiRenameTopic,
} from '../api/topics';
import type { Topic } from '../types/api';
import { navigation, restoreActiveTopic, setActiveTopic } from './navigation.svelte';
import { pruneNotesCacheForTopic } from './notes.svelte';

export const topicsStore = $state<{
  topics: Topic[];
  loading: boolean;
  error: string | null;
}>({
  topics: [],
  loading: false,
  error: null,
});

export async function loadTopics(): Promise<void> {
  topicsStore.loading = true;
  topicsStore.error = null;
  try {
    topicsStore.topics = await listTopics();
    restoreActiveTopic(topicsStore.topics);
  } catch (e) {
    topicsStore.error = e instanceof Error ? e.message : 'не удалось загрузить топики';
  } finally {
    topicsStore.loading = false;
  }
}

export async function createTopic(name: string): Promise<void> {
  const topic = await apiCreateTopic(name);
  topicsStore.topics = [...topicsStore.topics, topic];
  // Первый топик — сразу активным.
  if (topicsStore.topics.length === 1 || navigation.activeTopicID === null) {
    setActiveTopic(topic.id);
  }
}

export async function renameTopic(id: number, name: string): Promise<void> {
  const updated = await apiRenameTopic(id, name);
  topicsStore.topics = topicsStore.topics.map((t) => (t.id === id ? updated : t));
}

export async function deleteTopic(id: number): Promise<void> {
  await apiDeleteTopic(id);
  topicsStore.topics = topicsStore.topics.filter((t) => t.id !== id);
  pruneNotesCacheForTopic(id);
  if (navigation.activeTopicID === id) {
    restoreActiveTopic(topicsStore.topics);
  }
}

/** Сброс стора (выход из аккаунта). */
export function resetTopics(): void {
  topicsStore.topics = [];
  topicsStore.loading = false;
  topicsStore.error = null;
}
