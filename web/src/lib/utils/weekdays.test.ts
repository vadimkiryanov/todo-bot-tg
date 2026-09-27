import { describe, expect, it } from 'vitest';
import {
  WEEKDAY_LABELS,
  formatUtcWeekdaysAt,
  formatWeekdays,
  localWeekday,
  shiftWeekdays,
  utcWeekday,
  weekdayShift,
} from './weekdays';

describe('localWeekday / utcWeekday', () => {
  it('понедельник — 1, воскресенье — 7 (локальный кадр)', () => {
    expect(localWeekday(new Date(2026, 7, 3, 12, 0))).toBe(1); // 3 августа 2026, Пн
    expect(localWeekday(new Date(2026, 7, 9, 12, 0))).toBe(7); // 9 августа 2026, Вс
  });

  it('понедельник — 1, воскресенье — 7 (UTC-кадр)', () => {
    expect(utcWeekday(new Date('2026-08-03T12:00:00Z'))).toBe(1);
    expect(utcWeekday(new Date('2026-08-09T12:00:00Z'))).toBe(7);
  });
});

describe('weekdayShift', () => {
  // Сдвиг кадров зависит от часового пояса машины, поэтому сверяем инвариант,
  // а не конкретное число: локальный день + сдвиг = UTC-день того же момента.
  it('переводит локальный день в UTC-день любого момента', () => {
    const moments = [
      new Date('2026-08-06T22:30:00Z'),
      new Date('2026-08-06T00:30:00Z'),
      new Date(2026, 2, 1, 3, 0),
    ];
    for (const m of moments) {
      const shift = weekdayShift(m);
      expect(shift).toBeGreaterThanOrEqual(0);
      expect(shift).toBeLessThanOrEqual(6);
      expect(((localWeekday(m) - 1 + shift) % 7) + 1).toBe(utcWeekday(m));
    }
  });
});

describe('shiftWeekdays', () => {
  it('сдвигает дни по кругу недели и сортирует', () => {
    expect(shiftWeekdays([1, 3, 5], 3)).toEqual([1, 4, 6]);
    expect(shiftWeekdays([2], -1)).toEqual([1]);
  });

  it('сдвиг на полный круг недели набор не меняет', () => {
    expect(shiftWeekdays([1, 3], 7)).toEqual([1, 3]);
    expect(shiftWeekdays([7], -7)).toEqual([7]);
  });

  it('убирает повторы и номера вне 1..7', () => {
    expect(shiftWeekdays([1, 1, 0, 8, 3], 0)).toEqual([1, 3]);
  });
});

describe('formatWeekdays', () => {
  it('подписи по возрастанию через запятую', () => {
    expect(formatWeekdays([3, 1])).toBe('Пн, Ср');
    expect(formatWeekdays([])).toBe('');
    expect(formatWeekdays([0, 9])).toBe('');
  });
});

describe('formatUtcWeekdaysAt', () => {
  it('показывает те же дни, что выбрал пользователь в своём кадре', () => {
    const at = new Date(2026, 8, 5, 14, 5).toISOString();
    const picked = localWeekday(new Date(at));
    const utcDays = shiftWeekdays([picked], weekdayShift(new Date(at)));
    expect(formatUtcWeekdaysAt(utcDays, at)).toBe(WEEKDAY_LABELS[picked - 1]);
  });

  it('пустой набор — пустая подпись', () => {
    expect(formatUtcWeekdaysAt([], new Date().toISOString())).toBe('');
  });
});
