// Компактная форма напоминания: свой календарь (сетка месяца + время) и
// тип повторения once/daily/weekly/monthly. Для недельного выбираются дни
// недели, для месячного — числа месяца (чипы 1..31 под календарём); числа
// сверяются сервером в UTC-кадре `reminder_at`, поэтому сдвига у них нет
// в отличие от дней недели. Используется в странице заметки и в панели
// создания заметки (InputBar).
// Валидация как на сервере: одноразовое напоминание не может быть в прошлом,
// недельному нужен хотя бы один день недели, месячному — хотя бы одно число.
// Вид — телеграмный календарь: круглые ячейки, выбранный день залит акцентным
// кругом, сегодняшний — тонким кольцом, шапка месяца по центру.
// Кнопки «Отмена»/«Сохранить» — Button библиотеки (loading показывает спиннер
// сам); h-10! держит прежнюю геометрию формы. Календарь свой: у telegram-ui нет
// пикера дат, а нативный datetime-local не даёт выбрать дни недели (главное
// требование этой формы). Время — нативные `<select>`: библиотечные Select и
// пикеры это отдельный заход (AGENTS.md §2). Сегмент-тогл повторения тоже свой:
// у Button нет состояния «выбран» (то же решение, что у тоглов «В топике/Везде»).
import { useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';

import type { ReminderRepeat } from '../types/api';
import { WEEKDAY_LABELS, localWeekday, shiftWeekdays, weekdayShift } from '../utils/weekdays';

interface ReminderFormProps {
  /** Текущее напоминание (ISO 8601 UTC) или '' — нового нет. */
  initial?: string;
  initialRepeat?: ReminderRepeat;
  /** Дни недели текущего напоминания (номера 1..7 в UTC-кадре, как в API). */
  initialWeekdays?: number[];
  /** Числа месяца текущего напоминания (1..31, как в API). */
  initialMonthDays?: number[];
  busy?: boolean;
  /** Вызывается при сохранении: ISO (UTC), повтор, дни недели (1..7, UTC-кадр)
   *  и числа месяца (1..31); неиспользуемый набор — пустой массив. */
  onSubmit: (
    iso: string,
    repeat: ReminderRepeat,
    weekdays: number[],
    monthDays: number[],
  ) => Promise<void>;
  onCancel: () => void;
  /** Вызывается после успешного onSubmit. */
  onSaved: () => void;
}

const MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const MONTH_DAY_NUMBERS = Array.from({ length: 31 }, (_, i) => i + 1);

const REPEAT_ITEMS: ReminderRepeat[] = ['once', 'daily', 'weekly', 'monthly'];
const REPEAT_LABELS: Record<ReminderRepeat, string> = {
  once: 'Один раз',
  daily: 'Ежедневно',
  weekly: 'По неделям',
  monthly: 'По числам',
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

const roundCellBase =
  'btn-press mx-auto flex aspect-square w-full max-w-11 items-center justify-center rounded-full transition-colors';

/** Круглая ячейка календаря: акцентный круг, тонкое кольцо «сегодня». */
function roundCell(state: 'selected' | 'today' | 'past' | 'plain'): string {
  switch (state) {
    case 'selected':
      return `${roundCellBase} bg-primary font-semibold text-white`;
    case 'today':
      return `${roundCellBase} text-foreground ring-1 ring-primary/50`;
    case 'past':
      return `${roundCellBase} text-muted-foreground/40`;
    default:
      return `${roundCellBase} text-foreground`;
  }
}

/** Круглый чип числа месяца: выбран — залит акцентом, иначе — с кольцом. */
function monthDayChip(selected: boolean): string {
  return selected
    ? `${roundCellBase} bg-primary font-semibold text-white`
    : `${roundCellBase} text-muted-foreground ring-1 ring-border`;
}

/** Полночь сегодняшнего дня (локально) — нижняя граница выбора даты. */
function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Момент начала: новое напоминание — ближайший получас, иначе — прежнее. */
function initialMoment(initial: string): Date {
  return initial === '' ? new Date(Date.now() + 30 * 60_000) : new Date(initial);
}

export function ReminderForm({
  initial = '',
  initialRepeat = 'once',
  initialWeekdays = [],
  initialMonthDays = [],
  busy = false,
  onSubmit,
  onCancel,
  onSaved,
}: ReminderFormProps) {
  // Единственный источник правды — выбранный момент (локальное время формы).
  const [picked, setPicked] = useState<Date>(() => initialMoment(initial));
  // Показываемый месяц (может отличаться от месяца выбранной даты при листании).
  const [view, setView] = useState(() => ({
    y: picked.getFullYear(),
    m: picked.getMonth(),
  }));
  const [repeat, setRepeat] = useState<ReminderRepeat>(initialRepeat);
  // Дни недели в ЛОКАЛЬНОМ кадре пользователя; в API уходят сдвинутыми в UTC.
  const [localDays, setLocalDays] = useState<number[]>(() => {
    if (initialRepeat === 'weekly' && initialWeekdays.length > 0) {
      return shiftWeekdays(initialWeekdays, (7 - weekdayShift(picked)) % 7);
    }
    return [localWeekday(picked)];
  });
  // Числа месяца — без сдвига: число месяца от смены кадра не меняется.
  const [monthDays, setMonthDays] = useState<number[]>(() =>
    initialRepeat === 'monthly' && initialMonthDays.length > 0
      ? [...initialMonthDays].sort((a, b) => a - b)
      : [picked.getDate()],
  );
  const [error, setError] = useState('');

  const today = todayStart();

  /** Заменить часть выбранного момента, сохранив остальные поля. */
  function setPart(part: Partial<{ y: number; m: number; d: number; h: number; min: number }>): void {
    setPicked(
      new Date(
        part.y ?? picked.getFullYear(),
        part.m ?? picked.getMonth(),
        part.d ?? picked.getDate(),
        part.h ?? picked.getHours(),
        part.min ?? picked.getMinutes(),
      ),
    );
  }

  /** Выбор типа повторения: набор по умолчанию — день/число выбранной даты. */
  function changeRepeat(item: ReminderRepeat): void {
    setRepeat(item);
    if (item === 'weekly' && localDays.length === 0) {
      setLocalDays([localWeekday(picked)]);
    }
    if (item === 'monthly' && monthDays.length === 0) {
      setMonthDays([picked.getDate()]);
    }
  }

  function toggleDay(day: number): void {
    setLocalDays((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b),
    );
  }

  function toggleMonthDay(day: number): void {
    setMonthDays((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b),
    );
  }

  async function submit(): Promise<void> {
    if (repeat === 'weekly' && localDays.length === 0) {
      setError('выбери хотя бы один день недели');
      return;
    }
    if (repeat === 'monthly' && monthDays.length === 0) {
      setError('выбери хотя бы одно число месяца');
      return;
    }
    // Одноразовое напоминание не может быть в прошлом (то же правило, что на сервере).
    if (repeat === 'once' && picked.getTime() <= Date.now()) {
      setError('время напоминания уже прошло');
      return;
    }
    // Дни недели сервер сверяет в UTC, а выбраны они по локальным часам:
    // переносим весь набор на постоянный сдвиг «локальный день → UTC-день».
    const weekdays = repeat === 'weekly' ? shiftWeekdays(localDays, weekdayShift(picked)) : [];
    setError('');
    try {
      await onSubmit(picked.toISOString(), repeat, weekdays, repeat === 'monthly' ? monthDays : []);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка');
    }
  }

  // Сетка месяца: пустые ячейки до первого числа (неделя с понедельника).
  const firstWeekday = localWeekday(new Date(view.y, view.m, 1));
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const atCurrentMonth = view.y === today.getFullYear() && view.m === today.getMonth();

  function shiftMonth(delta: number): void {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }

  const selectClass =
    'input-press rounded-lg border border-border bg-muted px-2 py-2 text-sm outline-none focus:border-ring';

  return (
    <form
      className="flex flex-col gap-2 rounded-xl border border-border bg-muted p-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="rounded-lg border border-border p-1.5">
        {/* Шапка месяца: подпись по центру, стрелки — по краям поверх неё
            (иначе длинное «сентябрь 2026» смещает центр). */}
        <div className="relative mb-1 flex items-center justify-center">
          <button
            type="button"
            aria-label="Предыдущий месяц"
            disabled={atCurrentMonth}
            onClick={() => {
              shiftMonth(-1);
            }}
            className="btn-press absolute left-0 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground disabled:opacity-30"
          >
            ‹
          </button>
          <span className="text-sm font-medium capitalize">
            {MONTHS[view.m]} {view.y}
          </span>
          <button
            type="button"
            aria-label="Следующий месяц"
            onClick={() => {
              shiftMonth(1);
            }}
            className="btn-press absolute right-0 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="pb-0.5 text-center text-[11px] text-muted-foreground">
              {label}
            </div>
          ))}
          {Array.from({ length: firstWeekday - 1 }, (_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const date = new Date(view.y, view.m, day);
            const isPast = date.getTime() < today.getTime();
            const isSelected =
              picked.getFullYear() === view.y &&
              picked.getMonth() === view.m &&
              picked.getDate() === day;
            const isToday = date.getTime() === today.getTime();
            const state = isSelected ? 'selected' : isToday ? 'today' : isPast ? 'past' : 'plain';
            return (
              <button
                key={day}
                type="button"
                disabled={isPast}
                aria-pressed={isSelected}
                onClick={() => {
                  setPart({ y: view.y, m: view.m, d: day });
                }}
                className={`${roundCell(state)} text-sm`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <select
          aria-label="Часы"
          value={picked.getHours()}
          onChange={(e) => {
            setPart({ h: Number(e.target.value) });
          }}
          className={selectClass}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {pad2(h)}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground">:</span>
        <select
          aria-label="Минуты"
          value={picked.getMinutes()}
          onChange={(e) => {
            setPart({ min: Number(e.target.value) });
          }}
          className={selectClass}
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {pad2(m)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 rounded-lg bg-border/40 p-1">
        {REPEAT_ITEMS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={repeat === item}
            className={`btn-press-wide h-8 flex-1 rounded-md text-xs transition-colors ${
              repeat === item ? 'bg-primary font-medium text-white' : 'text-muted-foreground'
            }`}
            onClick={() => {
              changeRepeat(item);
            }}
          >
            {REPEAT_LABELS[item]}
          </button>
        ))}
      </div>

      {repeat === 'weekly' && (
        /* Появившийся набор дней — тем же подъёмом, что и сам пикер
           (.rise-anim): смена типа повторения должна читаться как появление
           блока, а не как мгновенная вставка. */
        <div className="rise-anim flex gap-1" role="group" aria-label="Дни недели">
          {WEEKDAY_LABELS.map((label, i) => {
            const day = i + 1;
            const selected = localDays.includes(day);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  toggleDay(day);
                }}
                className={`btn-press h-11 flex-1 rounded-lg text-xs transition-colors ${
                  selected
                    ? 'bg-primary font-medium text-white'
                    : 'border border-border text-muted-foreground'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {repeat === 'monthly' && (
        <div className="rise-anim grid grid-cols-7 gap-y-0.5" role="group" aria-label="Числа месяца">
          {MONTH_DAY_NUMBERS.map((day) => {
            const selected = monthDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  toggleMonthDay(day);
                }}
                className={`${monthDayChip(selected)} text-xs`}
              >
                {day}
              </button>
            );
          })}
        </div>
      )}

      {error !== '' && <p className="rise-anim text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" mode="outline" className="h-10! flex-1 btn-press-wide" onClick={onCancel}>
          Отмена
        </Button>
        <Button
          type="submit"
          mode="filled"
          className="h-10! flex-1 disabled:opacity-50 btn-press-wide"
          disabled={busy}
          loading={busy}
        >
          Сохранить
        </Button>
      </div>
    </form>
  );
}
