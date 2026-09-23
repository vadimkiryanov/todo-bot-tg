// Слой всплывающих подсказок: фиксирован снизу по центру, выше панели ввода,
// поверх любых модалок/шторок (z-[200]). Автоскрытие делает стор (toast.ts);
// сам тост кликабелен и скрывается досрочно. Контейнер не ловит тапы.
// Маркер вида — иконки библиотеки (галочка / крестик / вопрос): эмодзи в
// тостах заменены на них, чтобы набор иконок в приложении был один.
// Уход тоста доигрывает сам слой: стор убирает подсказку из очереди сразу
// (на этом держатся его тесты и логика «не больше N»), а здесь она остаётся
// в разметке на время .toast-out — иначе подсказка исчезала рывком, хотя
// появлялась плавно.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon16Cancel } from '@telegram-apps/telegram-ui/dist/icons/16/cancel';
import { Icon20QuestionMark } from '@telegram-apps/telegram-ui/dist/icons/20/question_mark';
import { Icon20Select } from '@telegram-apps/telegram-ui/dist/icons/20/select';

import { useToastStore } from '../stores/toast';
import type { ToastItem, ToastKind } from '../stores/toast';
import { dismissToast } from '../stores/toast';

/** Длительность обратной анимации — как у .toast-out в app.css. */
const LEAVE_MS = 180;

const ICONS: Record<ToastKind, ReactNode> = {
  success: <Icon20Select className="h-5 w-5" />,
  error: <Icon16Cancel className="h-5 w-5" />,
  info: <Icon20QuestionMark className="h-5 w-5" />,
};

// Ошибка — акцентной рамкой, успех/инфо — обычной: цвет дублирует иконку.
const TONES: Record<ToastKind, string> = {
  success: 'border-border',
  error: 'border-destructive/50',
  info: 'border-border',
};

export function ToastHost() {
  const items = useToastStore((s) => s.items);
  // Тона, которых в очереди уже нет, но чей уход ещё играется.
  const [leaving, setLeaving] = useState<ToastItem[]>([]);
  const prevItems = useRef<ToastItem[]>(items);
  const leaveTimers = useRef(new Map<number, number>());

  // Что ушло из очереди — то доигрывает уход здесь. Ушедшее по вытеснению
  // («одновременно видно не больше N») тоже попадает сюда: подсказка не
  // должна пропадать рывком, даже если её вытеснила новая.
  useEffect(() => {
    const alive = new Set(items.map((t) => t.id));
    const gone = prevItems.current.filter((t) => !alive.has(t.id));
    prevItems.current = items;
    if (gone.length === 0) return;
    // Тост вернулся в очередь тем же id — он снова показывается как обычно.
    setLeaving((cur) => [...cur.filter((t) => !alive.has(t.id)), ...gone]);
  }, [items]);

  // Каждому уходящему — свой таймер снятия: соседи по очереди не продлевают
  // ему жизнь, а повторный рендер не запускает отсчёт заново.
  useEffect(() => {
    const timers = leaveTimers.current;
    for (const toast of leaving) {
      if (timers.has(toast.id)) continue;
      timers.set(
        toast.id,
        window.setTimeout(() => {
          timers.delete(toast.id);
          setLeaving((cur) => cur.filter((t) => t.id !== toast.id));
        }, LEAVE_MS),
      );
    }
  }, [leaving]);

  // Слой размонтировали — таймеры не должны сработать после этого.
  useEffect(() => {
    const timers = leaveTimers.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, []);

  // Порядок показа держим по id (стор выдаёт их по возрастанию, очередь — от
  // старых к новым): уходящий тост остаётся на своём месте, а не прыгает
  // вниз очереди, пока доигрывает уход.
  const rendered = [
    ...items.map((toast) => ({ toast, leaving: false })),
    ...leaving.map((toast) => ({ toast, leaving: true })),
  ].sort((a, b) => a.toast.id - b.toast.id);

  if (rendered.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+88px)]"
      role="status"
      aria-live="polite"
    >
      {rendered.map(({ toast, leaving: gone }) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismissToast(toast.id)}
          className={`btn-press-soft glass-menu pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl border px-4 py-2.5 text-left text-sm shadow-lg ${
            gone ? 'toast-out' : 'toast-anim'
          } ${TONES[toast.kind]}`}
        >
          <span className="shrink-0">{ICONS[toast.kind]}</span>
          <span className="min-w-0 break-words">{toast.message}</span>
        </button>
      ))}
    </div>
  );
}
