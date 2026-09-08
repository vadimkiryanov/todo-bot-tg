// Компактная форма напоминания: datetime-local + once/daily + Отмена/Сохранить.
// Используется в странице заметки и в панели создания заметки (InputBar).
// Валидация как на сервере: одноразовое напоминание не может быть в прошлом.
import { useEffect, useRef, useState } from 'react';

import type { ReminderRepeat } from '../types/api';

import { Spinner } from './Spinner';

interface ReminderFormProps {
  /** Текущее напоминание (ISO 8601 UTC) или '' — нового нет. */
  initial?: string;
  initialRepeat?: ReminderRepeat;
  busy?: boolean;
  /** Вызывается при сохранении с ISO (UTC) и типом повторения. */
  onSubmit: (iso: string, repeat: ReminderRepeat) => Promise<void>;
  onCancel: () => void;
  /** Вызывается после успешного onSubmit. */
  onSaved: () => void;
}

/** datetime-local (локальное время) → ISO 8601 UTC для API. */
function reminderToISO(value: string): string {
  return new Date(value).toISOString();
}

/** ISO 8601 UTC → значение datetime-local (локальное время). */
function isoToReminderInput(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Начало текущего дня в локальном времени (для min пикера). */
function todayStartLocal(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const REPEAT_ITEMS: ReminderRepeat[] = ['once', 'daily'];

export function ReminderForm({
  initial = '',
  initialRepeat = 'once',
  busy = false,
  onSubmit,
  onCancel,
  onSaved,
}: ReminderFormProps) {
  // По умолчанию — ближайший получас (значение инициализируется один раз при
  // открытии формы — она монтируется заново на каждый показ).
  const [value, setValue] = useState<string>(() =>
    initial === ''
      ? isoToReminderInput(new Date(Date.now() + 30 * 60_000).toISOString())
      : isoToReminderInput(initial),
  );
  const [repeat, setRepeat] = useState<ReminderRepeat>(initialRepeat);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const min = todayStartLocal();

  // React не поддерживает onCancel на <input> — слушаем нативный cancel
  // (закрытие пикера по Escape/«Отмена») напрямую на элементе: иначе флаг
  // pickerOpen остался бы «открытым» и следующий клик бы закрывал, а не открывал.
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const node = picker.current;
    if (node === null) return;
    const onCancel = () => {
      setPickerOpen(false);
    };
    node.addEventListener('cancel', onCancel);
    return () => node.removeEventListener('cancel', onCancel);
  }, []);

  /** Тоггл нативного календаря: клик открывает, повторный клик закрывает (не переоткрывает). */
  function togglePicker(e: React.MouseEvent<HTMLInputElement>): void {
    if (pickerOpen) {
      e.currentTarget.blur();
      setPickerOpen(false);
      return;
    }
    try {
      e.currentTarget.showPicker();
      setPickerOpen(true);
    } catch {
      // Safari: showPicker() для datetime-local недоступен — остаётся обычный фокус.
    }
  }

  async function submit(): Promise<void> {
    if (value === '') {
      setError('выбери дату и время');
      return;
    }
    // Одноразовое напоминание не может быть в прошлом (то же правило, что на сервере).
    if (repeat === 'once' && new Date(reminderToISO(value)).getTime() <= Date.now()) {
      setError('время напоминания уже прошло');
      return;
    }
    setError('');
    try {
      await onSubmit(reminderToISO(value), repeat);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ошибка');
    }
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {/* Автофокус на пикер при открытии формы */}
      <input
        ref={picker}
        type="datetime-local"
        autoFocus
        min={min}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onClick={togglePicker}
        onBlur={() => {
          setPickerOpen(false);
        }}
        className="cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <div className="flex gap-1 rounded-lg bg-border/40 p-1">
        {REPEAT_ITEMS.map((item) => (
          <button
            key={item}
            type="button"
            className={`h-8 flex-1 rounded-md text-xs transition-colors ${
              repeat === item ? 'bg-surface font-medium shadow-sm' : 'text-muted'
            }`}
            onClick={() => {
              setRepeat(item);
            }}
          >
            {item === 'once' ? 'Один раз' : 'Ежедневно'}
          </button>
        ))}
      </div>
      {error !== '' && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="h-10 flex-1 rounded-lg border border-border text-sm" onClick={onCancel}>
          Отмена
        </button>
        <button
          type="submit"
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-accent-strong text-sm font-medium text-white disabled:opacity-50"
          disabled={busy || value === ''}
        >
          {busy ? <Spinner size="15px" /> : 'Сохранить'}
        </button>
      </div>
    </form>
  );
}
