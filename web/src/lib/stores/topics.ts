// Топики: загрузка при старте, создание/переименование/удаление, авто-выбор активного.
import { create } from 'zustand';

import {
  createTopic as apiCreateTopic,
  deleteTopic as apiDeleteTopic,
  listTopics,
  renameTopic as apiRenameTopic,
} from '../api/topics';
import type { Topic } from '../types/api';
import { useNavigationStore } from './navigation';
import { restoreActiveTopic, setActiveTopic } from './navigation';
import { pruneNotesCacheForTopic } from './notes';

interface TopicsState {
  topics: Topic[];
  loading: boolean;
  error: string | null;
}

export const useTopicsStore = create<TopicsState>()(() => ({
  topics: [],
  loading: false,
  error: null,
}));

export async function loadTopics(): Promise<void> {
  useTopicsStore.setState({ loading: true, error: null });
  try {
    const topics = await listTopics();
    useTopicsStore.setState({ topics });
    restoreActiveTopic(topics);
  } catch (e) {
    useTopicsStore.setState({ error: e instanceof Error ? e.message : 'не удалось загрузить топики' });
  } finally {
    useTopicsStore.setState({ loading: false });
  }
}

export async function createTopic(name: string): Promise<void> {
  const topic = await apiCreateTopic(name);
  const state = useTopicsStore.getState();
  useTopicsStore.setState({ topics: [...state.topics, topic] });
  // Первый топик — сразу активным.
  if (useTopicsStore.getState().topics.length === 1 || useNavigationStore.getState().activeTopicID === null) {
    setActiveTopic(topic.id);
  }
}

export async function renameTopic(id: number, name: string): Promise<void> {
  const updated = await apiRenameTopic(id, name);
  const state = useTopicsStore.getState();
  useTopicsStore.setState({ topics: state.topics.map((t) => (t.id === id ? updated : t)) });
}

export async function deleteTopic(id: number): Promise<void> {
  await apiDeleteTopic(id);
  const state = useTopicsStore.getState();
  useTopicsStore.setState({ topics: state.topics.filter((t) => t.id !== id) });
  pruneNotesCacheForTopic(id);
  if (useNavigationStore.getState().activeTopicID === id) {
    restoreActiveTopic(useTopicsStore.getState().topics);
  }
}

/** Сброс стора (выход из аккаунта). */
export function resetTopics(): void {
  useTopicsStore.setState({ topics: [], loading: false, error: null });
}
