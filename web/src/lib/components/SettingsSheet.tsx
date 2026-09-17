// Настройки интерфейса (шторка из бургер-меню). Пункты:
// 1. 📁 формат показа папок на уровне списка: строки в общем списке
//    (как в боте) или только кнопка 📁 (stores/settings.foldersMode).
// 2. 🧭 где живёт «хлебный путь» в папках: внутри активного таба
//    островка топиков или отдельной строкой под ним (pathMode).
// 3. ✏️ как включается редактирование заметки (NotePage): тапом по тексту
//    или кнопкой ✏️/👁 в шапке (editorMode).
// 4. 👁 как выглядит само поле правки: текст с оформлением, без символов
//    markdown-разметки, или сырой текст с разметкой (editorView).
// 5. 🧰 показывать ли панель форматирования в футере правки заметки —
//    кнопки оформления и подсказку под ними (formatPanel).
// 6. 🔀 как перелистываются топики: сдвигом контента вбок (как раньше) или
//    кросс-фейдом без сдвига (swipeMode).
// Выбор применяется сразу и сохраняется в localStorage.
import {
  setEditorMode,
  setEditorView,
  setFoldersMode,
  setFormatPanel,
  setPathMode,
  setSwipeMode,
  useSettingsStore,
} from '../stores/settings';
import type {
  EditorMode,
  EditorView,
  FoldersMode,
  FormatPanel,
  PathMode,
  SwipeMode,
} from '../stores/settings';

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

const editorModes: { value: EditorMode; label: string; caption: string }[] = [
  {
    value: 'tap',
    label: 'Тапом по тексту',
    caption: 'тап по заметке сразу включает поле ввода (как раньше)',
  },
  {
    value: 'toggle',
    label: 'Кнопкой ✏️',
    caption: 'превью и редактирование переключаются кнопкой в шапке',
  },
];

const editorViews: { value: EditorView; label: string; caption: string }[] = [
  {
    value: 'formatted',
    label: 'Без разметки',
    caption: 'заголовки, списки, чеклист, жирный/курсив/код/ссылка — маркеры скрыты',
  },
  {
    value: 'plain',
    label: 'С разметкой',
    caption: 'видно символы **жирный**, - пункт, # заголовок (как раньше)',
  },
];

const formatPanels: { value: FormatPanel; label: string; caption: string }[] = [
  {
    value: 'show',
    label: 'Показывать',
    caption: 'под полем правки — кнопки оформления и подсказка по разметке',
  },
  {
    value: 'hide',
    label: 'Не показывать',
    caption: 'текст правки без панели: оформление только разметкой',
  },
];

const swipeModes: { value: SwipeMode; label: string; caption: string }[] = [
  {
    value: 'slide',
    label: 'Сдвигом',
    caption: 'заметки уезжают вбок, как раньше',
  },
  {
    value: 'fade',
    label: 'Растворением',
    caption: 'заметки проявляются друг через друга, не уезжая вбок',
  },
];

export function SettingsSheet({ open = false, onClose }: SettingsSheetProps) {
  const foldersMode = useSettingsStore((s) => s.foldersMode);
  const pathMode = useSettingsStore((s) => s.pathMode);
  const editorMode = useSettingsStore((s) => s.editorMode);
  const editorView = useSettingsStore((s) => s.editorView);
  const swipeMode = useSettingsStore((s) => s.swipeMode);
  const formatPanel = useSettingsStore((s) => s.formatPanel);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col gap-1 px-1 py-2">
        <h2 className="px-2 pb-2 pt-1 text-lg font-semibold">⚙️ Настройки</h2>
        <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">📁 Папки</h3>
        {modes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            aria-pressed={foldersMode === mode.value}
            onClick={() => setFoldersMode(mode.value)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left btn-press-soft transition-colors ${
              foldersMode === mode.value ? 'bg-primary text-white' : 'active:bg-border/50'
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-5">{mode.label}</span>
              <span
                className={`block text-xs leading-4 ${
                  foldersMode === mode.value ? 'text-white/75' : 'text-muted-foreground'
                }`}
              >
                {mode.caption}
              </span>
            </span>
            {foldersMode === mode.value && <span className="shrink-0 text-sm">✓</span>}
          </button>
        ))}
        <h3 className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          🧭 Путь к папке
        </h3>
        {pathModes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            aria-pressed={pathMode === mode.value}
            onClick={() => setPathMode(mode.value)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left btn-press-soft transition-colors ${
              pathMode === mode.value ? 'bg-primary text-white' : 'active:bg-border/50'
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-5">{mode.label}</span>
              <span
                className={`block text-xs leading-4 ${
                  pathMode === mode.value ? 'text-white/75' : 'text-muted-foreground'
                }`}
              >
                {mode.caption}
              </span>
            </span>
            {pathMode === mode.value && <span className="shrink-0 text-sm">✓</span>}
          </button>
        ))}
        <h3 className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          ✏️ Редактирование заметки
        </h3>
        {editorModes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            aria-pressed={editorMode === mode.value}
            onClick={() => setEditorMode(mode.value)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left btn-press-soft transition-colors ${
              editorMode === mode.value ? 'bg-primary text-white' : 'active:bg-border/50'
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-5">{mode.label}</span>
              <span
                className={`block text-xs leading-4 ${
                  editorMode === mode.value ? 'text-white/75' : 'text-muted-foreground'
                }`}
              >
                {mode.caption}
              </span>
            </span>
            {editorMode === mode.value && <span className="shrink-0 text-sm">✓</span>}
          </button>
        ))}
        <h3 className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          👁 Вид правки
        </h3>
        {editorViews.map((view) => (
          <button
            key={view.value}
            type="button"
            aria-pressed={editorView === view.value}
            onClick={() => setEditorView(view.value)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left btn-press-soft transition-colors ${
              editorView === view.value ? 'bg-primary text-white' : 'active:bg-border/50'
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-5">{view.label}</span>
              <span
                className={`block text-xs leading-4 ${
                  editorView === view.value ? 'text-white/75' : 'text-muted-foreground'
                }`}
              >
                {view.caption}
              </span>
            </span>
            {editorView === view.value && <span className="shrink-0 text-sm">✓</span>}
          </button>
        ))}
        <h3 className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          🧰 Панель форматирования
        </h3>
        {formatPanels.map((panel) => (
          <button
            key={panel.value}
            type="button"
            aria-pressed={formatPanel === panel.value}
            onClick={() => setFormatPanel(panel.value)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left btn-press-soft transition-colors ${
              formatPanel === panel.value ? 'bg-primary text-white' : 'active:bg-border/50'
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-5">{panel.label}</span>
              <span
                className={`block text-xs leading-4 ${
                  formatPanel === panel.value ? 'text-white/75' : 'text-muted-foreground'
                }`}
              >
                {panel.caption}
              </span>
            </span>
            {formatPanel === panel.value && <span className="shrink-0 text-sm">✓</span>}
          </button>
        ))}
        <h3 className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          🔀 Перелистывание топиков
        </h3>
        {swipeModes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            aria-pressed={swipeMode === mode.value}
            onClick={() => setSwipeMode(mode.value)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left btn-press-soft transition-colors ${
              swipeMode === mode.value ? 'bg-primary text-white' : 'active:bg-border/50'
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-5">{mode.label}</span>
              <span
                className={`block text-xs leading-4 ${
                  swipeMode === mode.value ? 'text-white/75' : 'text-muted-foreground'
                }`}
              >
                {mode.caption}
              </span>
            </span>
            {swipeMode === mode.value && <span className="shrink-0 text-sm">✓</span>}
          </button>
        ))}
      </div>
    </Modal>
  );
}
