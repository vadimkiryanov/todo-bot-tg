// Слой всплывающих подсказок: фиксирован снизу по центру, выше панели ввода,
// поверх любых модалок/шторок (z-[200]). Автоскрытие делает стор (toast.ts);
// сам тост кликабелен и скрывается досрочно. Контейнер не ловит тапы.
// Маркер вида — иконки библиотеки (галочка / крестик / вопрос): эмодзи в
// тостах заменены на них, чтобы набор иконок в приложении был один.
import type { ReactNode } from 'react';
import { Icon16Cancel } from '@telegram-apps/telegram-ui/dist/icons/16/cancel';
import { Icon20QuestionMark } from '@telegram-apps/telegram-ui/dist/icons/20/question_mark';
import { Icon20Select } from '@telegram-apps/telegram-ui/dist/icons/20/select';

import { useToastStore } from '../stores/toast';
import type { ToastItem, ToastKind } from '../stores/toast';
import { dismissToast } from '../stores/toast';

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
  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+88px)]"
      role="status"
      aria-live="polite"
    >
      {items.map((toast: ToastItem) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismissToast(toast.id)}
          className={`btn-press-soft toast-anim glass-menu pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl border px-4 py-2.5 text-left text-sm shadow-lg ${TONES[toast.kind]}`}
        >
          <span className="shrink-0">{ICONS[toast.kind]}</span>
          <span className="min-w-0 break-words">{toast.message}</span>
        </button>
      ))}
    </div>
  );
}
