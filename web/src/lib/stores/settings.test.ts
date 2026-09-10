// Тесты настроек интерфейса: режим показа папок в списке заметок, место
// «хлебного пути» (в табе островка / отдельной строкой), способ включения
// редактирования заметки (тапом по тексту / кнопкой ✏️) и режим перелистывания
// топиков (сдвигом / кросс-фейдом). По умолчанию — папки «в списке» (как в боте),
// путь «в табе», редактирование «тапом» и перелистывание «сдвигом»; переключение
// сохраняется в localStorage и восстанавливается при старте модуля.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setEditorMode, setFoldersMode, setPathMode, setSwipeMode, useSettingsStore } from './settings';

/** Чтение zustand-состояния в синтаксисе прежнего $state-объекта. */
const settings = {
  get foldersMode() {
    return useSettingsStore.getState().foldersMode;
  },
  get pathMode() {
    return useSettingsStore.getState().pathMode;
  },
  get editorMode() {
    return useSettingsStore.getState().editorMode;
  },
  get swipeMode() {
    return useSettingsStore.getState().swipeMode;
  },
};

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

describe('settings store', () => {
  it('по умолчанию папки показываются в списке заметок', () => {
    expect(settings.foldersMode).toBe('list');
  });

  it('переключение режима обновляет стор и localStorage', () => {
    setFoldersMode('button');
    expect(settings.foldersMode).toBe('button');
    expect(localStorage.getItem('todo.foldersMode')).toBe('button');

    setFoldersMode('list');
    expect(settings.foldersMode).toBe('list');
    expect(localStorage.getItem('todo.foldersMode')).toBe('list');
  });

  // Статический импорт уже инициализировал стор (default 'list') — для
  // проверки восстановления грузим модуль заново с заполненным хранилищем.
  it('при старте восстанавливается сохранённый режим', async () => {
    localStorage.setItem('todo.foldersMode', 'button');
    vi.resetModules();
    const mod = await import('./settings');
    expect(mod.useSettingsStore.getState().foldersMode).toBe('button');
  });

  it('по умолчанию путь показывается в табе островка', () => {
    expect(settings.pathMode).toBe('tab');
  });

  it('переключение режима пути обновляет стор и localStorage', () => {
    setPathMode('strip');
    expect(settings.pathMode).toBe('strip');
    expect(localStorage.getItem('todo.pathMode')).toBe('strip');

    setPathMode('tab');
    expect(settings.pathMode).toBe('tab');
    expect(localStorage.getItem('todo.pathMode')).toBe('tab');
  });

  it('при старте восстанавливается сохранённый режим пути', async () => {
    localStorage.setItem('todo.pathMode', 'strip');
    vi.resetModules();
    const mod = await import('./settings');
    expect(mod.useSettingsStore.getState().pathMode).toBe('strip');
  });

  it('по умолчанию редактирование включается тапом по тексту', () => {
    expect(settings.editorMode).toBe('tap');
  });

  it('переключение режима редактирования обновляет стор и localStorage', () => {
    setEditorMode('toggle');
    expect(settings.editorMode).toBe('toggle');
    expect(localStorage.getItem('todo.editorMode')).toBe('toggle');

    setEditorMode('tap');
    expect(settings.editorMode).toBe('tap');
    expect(localStorage.getItem('todo.editorMode')).toBe('tap');
  });

  it('при старте восстанавливается сохранённый режим редактирования', async () => {
    localStorage.setItem('todo.editorMode', 'toggle');
    vi.resetModules();
    const mod = await import('./settings');
    expect(mod.useSettingsStore.getState().editorMode).toBe('toggle');
  });

  it('по умолчанию топики перелистываются сдвигом', () => {
    expect(settings.swipeMode).toBe('slide');
  });

  it('переключение режима перелистывания обновляет стор и localStorage', () => {
    setSwipeMode('fade');
    expect(settings.swipeMode).toBe('fade');
    expect(localStorage.getItem('todo.swipeMode')).toBe('fade');

    setSwipeMode('slide');
    expect(settings.swipeMode).toBe('slide');
    expect(localStorage.getItem('todo.swipeMode')).toBe('slide');
  });

  it('при старте восстанавливается сохранённый режим перелистывания', async () => {
    localStorage.setItem('todo.swipeMode', 'fade');
    vi.resetModules();
    const mod = await import('./settings');
    expect(mod.useSettingsStore.getState().swipeMode).toBe('fade');
  });
});
