// Топики: загрузка при старте, создание/переименование/удаление, закреп,
// авто-выбор активного. Закреплённые (быстрые топики бота) идут первыми.
import { create } from 'zustand';

import {
  createTopic as apiCreateTopic,
  deleteTopic as apiDeleteTopic,
  listTopics,
  renameTopic as apiRenameTopic,
  setTopicPinned as apiSetTopicPinned,
} from '../api/topics';
import type { Topic } from '../types/api';
import { useNavigationStore } from './navigation';
import { restoreActiveTopic, setActiveTopic } from './navigation';
import { pruneNotesCacheForTopic } from './notes';
import { toastError, toastSuccess } from './toast';

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

/** Закреплённые — вперёд, дальше по id (порядок бэкенда: ORDER BY id).
    Id-порядок как вторичный ключ делает список устойчивым к закрепу из UI
    (откреплённый топик возвращается на своё место), а не «прилипает» туда,
    куда его поставила перестановка. Закреп совпадает с быстрыми топиками
    бота: список табов/слайдов читается из этого стора — сортировать
    достаточно здесь. */
function sortPinnedFirst(topics: Topic[]): Topic[] {
  return [...topics].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.id - b.id);
}

export async function loadTopics(): Promise<void> {
  useTopicsStore.setState({ loading: true, error: null });
  try {
    const topics = sortPinnedFirst(await listTopics());
    useTopicsStore.setState({ topics });
    restoreActiveTopic(topics);
  } catch (e) {
    useTopicsStore.setState({ error: e instanceof Error ? e.message : 'не удалось загрузить топики' });
  } finally {
    useTopicsStore.setState({ loading: false });
  }
}

/** Ошибка операции с топиком: тост + проброс (компоненты ловят для инлайна). */
function topicOpError(e: unknown, fallback: string): Error {
  const err = e instanceof Error ? e : new Error(fallback);
  toastError(err.message);
  return err;
}

export async function createTopic(name: string): Promise<void> {
  let topic: Topic;
  try {
    topic = await apiCreateTopic(name);
  } catch (e) {
    throw topicOpError(e, 'не удалось создать топик');
  }
  const state = useTopicsStore.getState();
  useTopicsStore.setState({ topics: sortPinnedFirst([...state.topics, topic]) });
  // Первый топик — сразу активным.
  if (useTopicsStore.getState().topics.length === 1 || useNavigationStore.getState().activeTopicID === null) {
    setActiveTopic(topic.id);
  }
  toastSuccess('Топик создан');
}

export async function renameTopic(id: number, name: string): Promise<void> {
  let updated: Topic;
  try {
    updated = await apiRenameTopic(id, name);
  } catch (e) {
    throw topicOpError(e, 'не удалось переименовать топик');
  }
  const state = useTopicsStore.getState();
  useTopicsStore.setState({
    topics: sortPinnedFirst(state.topics.map((t) => (t.id === id ? updated : t))),
  });
  toastSuccess('Топик переименован');
}

/** Закрепить/открепить топик (быстрый топик бота): закреплённые переезжают
 *  в начало списка табов и слайдов. */
export async function setTopicPinned(id: number, pinned: boolean): Promise<void> {
  let updated: Topic;
  try {
    updated = await apiSetTopicPinned(id, pinned);
  } catch (e) {
    throw topicOpError(e, pinned ? 'не удалось закрепить топик' : 'не удалось открепить топик');
  }
  const state = useTopicsStore.getState();
  useTopicsStore.setState({
    topics: sortPinnedFirst(state.topics.map((t) => (t.id === id ? updated : t))),
  });
  toastSuccess(pinned ? 'Топик закреплён' : 'Топик откреплён');
}

export async function deleteTopic(id: number): Promise<void> {
  try {
    await apiDeleteTopic(id);
  } catch (e) {
    throw topicOpError(e, 'не удалось удалить топик');
  }
  const state = useTopicsStore.getState();
  useTopicsStore.setState({ topics: state.topics.filter((t) => t.id !== id) });
  pruneNotesCacheForTopic(id);
  if (useNavigationStore.getState().activeTopicID === id) {
    restoreActiveTopic(useTopicsStore.getState().topics);
  }
  toastSuccess('Топик удалён');
}

/** Сброс стора (выход из аккаунта). */
export function resetTopics(): void {
  useTopicsStore.setState({ topics: [], loading: false, error: null });
}
