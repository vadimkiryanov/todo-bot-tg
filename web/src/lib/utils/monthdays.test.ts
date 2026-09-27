import { describe, expect, it } from 'vitest';

import { formatMonthDays, normalizeMonthDays } from './monthdays';

describe('normalizeMonthDays', () => {
  it('сортирует и убирает повторы', () => {
    expect(normalizeMonthDays([15, 1, 15, 31])).toEqual([1, 15, 31]);
  });

  it('отбрасывает числа вне 1..31 и нецелые', () => {
    expect(normalizeMonthDays([0, 32, -1, 1.5, 7])).toEqual([7]);
    expect(normalizeMonthDays([])).toEqual([]);
  });
});

describe('formatMonthDays', () => {
  it('подписи через запятую по возрастанию', () => {
    expect(formatMonthDays([15, 1])).toBe('1, 15');
    expect(formatMonthDays([])).toBe('');
  });
});
