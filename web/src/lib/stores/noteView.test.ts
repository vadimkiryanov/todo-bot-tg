// Тесты режима полного отображения заметок: по умолчанию ни одна заметка не
// развёрнута, переключение поштучное (id в множестве), отметки сохраняются в
// localStorage и восстанавливаются при старте модуля. Настройка локальна для
// устройства и не синхронизируется с ботом.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isNoteExpanded, toggleNoteExpanded, useNoteViewStore } from './noteView';

/** ID заметок, показываемых целиком. */
const expandedIds = (): number[] => [...useNoteViewStore.getState().expanded];

/** Мини-хранилище для node-окружения (в тестах localStorage нет). */
function createStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => void data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, String(value)),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('noteView store', () => {
  it('по умолчанию ни одна заметка не развёрнута', () => {
    expect(expandedIds()).toEqual([]);
    expect(isNoteExpanded(1)).toBe(false);
  });

  it('переключение разворачивает заметку и сохраняет отметку', () => {
    toggleNoteExpanded(7);
    expect(isNoteExpanded(7)).toBe(true);
    expect(localStorage.getItem('todo.expandedNotes')).toBe('[7]');

    toggleNoteExpanded(7);
    expect(isNoteExpanded(7)).toBe(false);
    expect(localStorage.getItem('todo.expandedNotes')).toBe('[]');
  });

  it('режим поштучный: разворот одной заметки не трогает остальные', () => {
    toggleNoteExpanded(1);
    toggleNoteExpanded(2);
    toggleNoteExpanded(1);

    expect(expandedIds().sort()).toEqual([2]);
    expect(localStorage.getItem('todo.expandedNotes')).toBe('[2]');
  });

  // Статический импорт уже инициализировал стор (пустым множеством) — для
  // проверки восстановления грузим модуль заново с заполненным хранилищем.
  it('при старте восстанавливаются сохранённые отметки', async () => {
    localStorage.setItem('todo.expandedNotes', '[3,15]');
    vi.resetModules();
    const mod = await import('./noteView');
    expect([...mod.useNoteViewStore.getState().expanded].sort((a, b) => a - b)).toEqual([3, 15]);
  });

  it('битые данные в хранилище — пустое множество', async () => {
    localStorage.setItem('todo.expandedNotes', '{"не":"массив"}');
    vi.resetModules();
    const mod = await import('./noteView');
    expect([...mod.useNoteViewStore.getState().expanded]).toEqual([]);
  });

  it('в хранилище отбрасываются значения не-числа', async () => {
    localStorage.setItem('todo.expandedNotes', '[4,"5",null]');
    vi.resetModules();
    const mod = await import('./noteView');
    expect([...mod.useNoteViewStore.getState().expanded]).toEqual([4]);
  });
});
