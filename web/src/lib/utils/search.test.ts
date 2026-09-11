import { describe, expect, it } from 'vitest';
import { groupNotesByTopic } from './search';
import type { Note, Topic } from '../types/api';

function note(id: number, topicId: number, text: string): Note {
  return {
    id,
    text,
    entities: [],
    priority: 'none',
    done: false,
    pinned: false,
    archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    topic_id: topicId,
    folder_id: null,
    reminder_at: null,
    reminder_repeat: 'once',
  };
}

describe('groupNotesByTopic', () => {
  const topics: Topic[] = [
    { id: 1, name: '🏠 Личное', note_count: 0, pinned: false },
    { id: 2, name: '💼 Работа', note_count: 0, pinned: false },
    { id: 3, name: '🎬 Идеи', note_count: 0, pinned: false },
  ];

  it('группирует по топику в порядке стора, внутри сохраняет порядок', () => {
    const notes = [
      note(1, 3, 'идея'),
      note(2, 1, 'личное'),
      note(3, 2, 'работа'),
      note(4, 1, 'ещё личное'),
    ];
    const groups = groupNotesByTopic(notes, topics);
    expect(groups.map((g) => g.name)).toEqual(['🏠 Личное', '💼 Работа', '🎬 Идеи']);
    expect(groups.map((g) => g.notes.map((n) => n.id))).toEqual([[2, 4], [3], [1]]);
  });

  it('неизвестные топики уходят в конец с фолбэком имени', () => {
    const notes = [note(1, 99, 'осиротевшая'), note(2, 1, 'личное'), note(3, 0, 'без топика')];
    const groups = groupNotesByTopic(notes, topics);
    expect(groups.map((g) => g.name)).toEqual(['🏠 Личное', 'Топик #99', 'Топик #0']);
  });

  it('пустой список — пустые группы', () => {
    expect(groupNotesByTopic([], topics)).toEqual([]);
  });
});
