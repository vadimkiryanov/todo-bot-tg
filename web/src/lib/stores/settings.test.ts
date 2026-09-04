// Тесты настроек интерфейса: режим показа папок в списке заметок и место
// «хлебного пути» (в табе островка / отдельной строкой). По умолчанию —
// папки «в списке» (как в боте) и путь «в табе»; переключение сохраняется
// в localStorage и восстанавливается при старте модуля.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setFoldersMode, setPathMode, settings } from './settings.svelte';

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
    const mod = await import('./settings.svelte');
    expect(mod.settings.foldersMode).toBe('button');
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
    const mod = await import('./settings.svelte');
    expect(mod.settings.pathMode).toBe('strip');
  });
});
