// Тесты очереди тостов. Окружение тестов — node (window нет), поэтому
// автоскрытие по таймеру не запускается: очередь меняется только явными
// вызовами, и проверки детерминированы.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  dismissToast,
  resetToasts,
  showToast,
  TOAST_MAX_VISIBLE,
  toastError,
  toastSuccess,
  useToastStore,
} from './toast';

/** Текущая очередь тостов (порядок показа — от старых к новым). */
function items() {
  return useToastStore.getState().items;
}

beforeEach(() => {
  resetToasts();
});

describe('toast store', () => {
  it('изначально очередь пуста', () => {
    expect(items()).toEqual([]);
  });

  it('showToast кладёт сообщение с заданным видом', () => {
    const id = showToast('Заметка создана', 'success');
    expect(items()).toEqual([{ id, kind: 'success', message: 'Заметка создана' }]);
  });

  it('вид по умолчанию — info', () => {
    showToast('Сообщение');
    expect(items()[0].kind).toBe('info');
  });

  it('сообщение обрезается по краям, пустое игнорируется', () => {
    expect(showToast('   ')).toBe(0);
    expect(items()).toEqual([]);

    showToast('  Сохранено  ');
    expect(items()[0].message).toBe('Сохранено');
  });

  it('toastSuccess/toastError проставляют вид', () => {
    toastSuccess('Готово');
    toastError('Не вышло');
    expect(items().map((t) => t.kind)).toEqual(['success', 'error']);
    expect(items().map((t) => t.message)).toEqual(['Готово', 'Не вышло']);
  });

  it('одновременно видно не больше TOAST_MAX_VISIBLE — старые вытесняются', () => {
    for (let i = 1; i <= TOAST_MAX_VISIBLE + 2; i++) showToast(`Сообщение ${i}`);

    expect(items()).toHaveLength(TOAST_MAX_VISIBLE);
    expect(items().map((t) => t.message)).toEqual(['Сообщение 3', 'Сообщение 4', 'Сообщение 5']);
  });

  it('dismissToast убирает тост по id, остальные остаются', () => {
    const first = showToast('Первый');
    const second = showToast('Второй');

    dismissToast(first);

    expect(items()).toEqual([{ id: second, kind: 'info', message: 'Второй' }]);
  });

  it('каждому тосту выдаётся свой id', () => {
    const a = showToast('A');
    const b = showToast('B');
    expect(a).not.toBe(b);
  });

  it('resetToasts очищает очередь', () => {
    showToast('Раз');
    showToast('Два');

    resetToasts();

    expect(items()).toEqual([]);
  });
});
