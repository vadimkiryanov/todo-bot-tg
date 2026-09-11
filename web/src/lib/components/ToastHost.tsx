// Слой всплывающих подсказок: фиксирован снизу по центру, выше панели ввода,
// поверх любых модалок/шторок (z-[200]). Автоскрытие делает стор (toast.ts);
// сам тост кликабелен и скрывается досрочно. Контейнер не ловит тапы.
import { useToastStore } from '../stores/toast';
import type { ToastItem, ToastKind } from '../stores/toast';
import { dismissToast } from '../stores/toast';

const ICONS: Record<ToastKind, string> = {
  success: '✅',
  error: '⚠️',
  info: 'ℹ️',
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
