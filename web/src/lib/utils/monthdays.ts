// Числа месяца для ежемесячного напоминания. В API они хранятся числами 1..31 и
// сверяются сервером в UTC-времени `reminder_at`. В отличие от дней недели,
// сдвига между локальным и UTC-кадром здесь нет: число месяца от сдвига часов
// не меняется (расхождение возможно лишь у самого края суток — это граница
// задокументирована в BACKEND_API_PLAN.md).

/** Числа месяца по возрастанию, только корректные 1..31. */
export function normalizeMonthDays(days: number[]): number[] {
  const set = new Set<number>();
  for (const d of days) {
    if (typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 31) {
      set.add(d);
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** Подписи чисел месяца через запятую: «1, 15». */
export function formatMonthDays(days: number[]): string {
  return normalizeMonthDays(days).join(', ');
}
