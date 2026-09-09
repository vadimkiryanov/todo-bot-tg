// Группировка результатов глобального поиска по топикам для сплиттеров.
import type { Note, Topic } from '../types/api';

export interface SearchGroup {
  topicId: number;
  /** Имя топика; для неизвестных (топик удалён, запись осиротела) — фолбэк. */
  name: string;
  notes: Note[];
}

/** Группирует заметки по topic_id: известные топики — в порядке topics-стора,
 * неизвестные — в конец. Внутри группы сохраняется исходный порядок заметок
 * (серверная сортировка: закреплённые → приоритет → свежие) — сортировка
 * массива по ключу группы стабильна (ES2019+). */
export function groupNotesByTopic(notes: Note[], topics: Topic[]): SearchGroup[] {
  const order = new Map<number, number>();
  topics.forEach((t, i) => order.set(t.id, i));
  const nameOf = (id: number): string =>
    topics.find((t) => t.id === id)?.name ?? `Топик #${id}`;

  const sorted = [...notes].sort((a, b) => {
    const ao = order.get(a.topic_id) ?? topics.length;
    const bo = order.get(b.topic_id) ?? topics.length;
    return ao - bo;
  });

  const groups: SearchGroup[] = [];
  for (const note of sorted) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.topicId === note.topic_id) {
      last.notes.push(note);
    } else {
      groups.push({ topicId: note.topic_id, name: nameOf(note.topic_id), notes: [note] });
    }
  }
  return groups;
}
