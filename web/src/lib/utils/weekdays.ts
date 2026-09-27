// Дни недели напоминания. В API они хранятся номерами ISO 8601 (1 = Пн … 7 = Вс)
// и сверяются сервером в UTC-времени `reminder_at`. Пользователь же выбирает дни
// по своим локальным часам, поэтому между кадрами есть постоянный сдвиг
// (utc-день − локальный день) — он одинаков для всех дней одного напоминания.

/** Короткие подписи по номеру дня (индекс 0 — понедельник). */
export const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Номер дня недели момента в локальном времени (1 = Пн … 7 = Вс). */
export function localWeekday(date: Date): number {
  const d = date.getDay(); // 0 = воскресенье
  return d === 0 ? 7 : d;
}

/** Номер дня недели момента в UTC (1 = Пн … 7 = Вс). */
export function utcWeekday(date: Date): number {
  const d = date.getUTCDay();
  return d === 0 ? 7 : d;
}

/** Сдвиг «локальный день → UTC-день» для момента: 0..6. */
export function weekdayShift(date: Date): number {
  return (utcWeekday(date) - localWeekday(date) + 7) % 7;
}

/** Сдвигает номера дней недели на shift и возвращает их по возрастанию. */
export function shiftWeekdays(days: number[], shift: number): number[] {
  const set = new Set<number>();
  for (const d of days) {
    if (d < 1 || d > 7) continue;
    set.add(((d - 1 + ((shift % 7) + 7)) % 7) + 1);
  }
  return [...set].sort((a, b) => a - b);
}

/** Подписи дней по их номерам через запятую: «Пн, Ср». */
export function formatWeekdays(days: number[]): string {
  return [...days]
    .filter((d) => d >= 1 && d <= 7)
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d - 1])
    .join(', ');
}

/** Подписи UTC-дней напоминания, приведённых к локальным дня пользователя. */
export function formatUtcWeekdaysAt(utcDays: number[], at: string): string {
  const shift = weekdayShift(new Date(at));
  return formatWeekdays(shiftWeekdays(utcDays, (7 - shift) % 7));
}
