// Настройки интерфейса (шторка из бургер-меню). Два пункта:
// 1. 📁 формат показа папок на уровне списка: строки в общем списке
//    (как в боте) или только кнопка 📁 (stores/settings.foldersMode).
// 2. 🧭 где живёт «хлебный путь» в папках: внутри активного таба
//    островка топиков или отдельной строкой под ним (pathMode).
// Выбор применяется сразу и сохраняется в localStorage.
import { setFoldersMode, setPathMode, useSettingsStore } from '../stores/settings';
import type { FoldersMode, PathMode } from '../stores/settings';

import { Modal } from './Modal';

interface SettingsSheetProps {
  open?: boolean;
  onClose?: () => void;
}

const modes: { value: FoldersMode; label: string; caption: string }[] = [
  {
    value: 'list',
    label: 'В списке заметок',
    caption: 'папки — строки среди заметок, кнопка 📁 скрыта',
  },
  {
    value: 'button',
    label: 'Отдельная кнопка',
    caption: 'папок в списке нет, вход — кнопка 📁',
  },
];

const pathModes: { value: PathMode; label: string; caption: string }[] = [
  {
    value: 'tab',
    label: 'В табе топика',
    caption: 'путь расширяет активный таб островка; тап — папки',
  },
  {
    value: 'strip',
    label: 'Отдельной строкой',
    caption: 'строка «Папка › Подпапка» под островком (как раньше)',
  },
];

export function SettingsSheet({ open = false, onClose }: SettingsSheetProps) {
  const foldersMode = useSettingsStore((s) => s.foldersMode);
  const pathMode = useSettingsStore((s) => s.pathMode);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col gap-1 px-1 py-2">
        <h2 className="px-2 pb-2 pt-1 text-lg font-semibold">⚙️ Настройки</h2>
        <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">📁 Папки</h3>
        {modes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            aria-pressed={foldersMode === mode.value}
            onClick={() => setFoldersMode(mode.value)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
              foldersMode === mode.value ? 'bg-accent-strong text-white' : 'active:bg-border/50'
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-5">{mode.label}</span>
              <span
                className={`block text-xs leading-4 ${
                  foldersMode === mode.value ? 'text-white/75' : 'text-muted'
                }`}
              >
                {mode.caption}
              </span>
            </span>
            {foldersMode === mode.value && <span className="shrink-0 text-sm">✓</span>}
          </button>
        ))}
        <h3 className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
          🧭 Путь к папке
        </h3>
        {pathModes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            aria-pressed={pathMode === mode.value}
            onClick={() => setPathMode(mode.value)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
              pathMode === mode.value ? 'bg-accent-strong text-white' : 'active:bg-border/50'
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-5">{mode.label}</span>
              <span
                className={`block text-xs leading-4 ${
                  pathMode === mode.value ? 'text-white/75' : 'text-muted'
                }`}
              >
                {mode.caption}
              </span>
            </span>
            {pathMode === mode.value && <span className="shrink-0 text-sm">✓</span>}
          </button>
        ))}
      </div>
    </Modal>
  );
}
