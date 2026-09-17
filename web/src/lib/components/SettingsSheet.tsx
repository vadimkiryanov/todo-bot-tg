// Настройки интерфейса (шторка из меню). Пункты:
// 1. формат показа папок на уровне списка: строки в общем списке
//    (как в боте) или только отдельная кнопка (stores/settings.foldersMode).
// 2. где живёт «хлебный путь» в папках: внутри активного таба
//    островка топиков или отдельной строкой под ним (pathMode).
// 3. как включается редактирование заметки (NotePage): тапом по тексту
//    или кнопкой в шапке (editorMode).
// 4. как выглядит само поле правки: текст с оформлением, без символов
//    markdown-разметки, или сырой текст с разметкой (editorView).
// 5. показывать ли панель форматирования в футере правки заметки —
//    кнопки оформления и подсказку под ними (formatPanel).
// 6. как перелистываются топики: сдвигом контента вбок (как раньше) или
//    кросс-фейдом без сдвига (swipeMode).
// Заголовки секций идут без иконок: подходящих иконок в наборе библиотеки
// нет, а заголовок — уже короткая подпись (политика иконок в web/AGENTS.md).
// Выбор применяется сразу и сохраняется в localStorage.
//
// Разметка списка — компоненты @telegram-apps/telegram-ui (List/Section/Cell):
// пилот миграции на этот UI-кит. AppRoot поднят в App.tsx — он один на всё
// приложение задаёт платформу и токены --tgui--*.
import { Cell, List, Section } from '@telegram-apps/telegram-ui';
import { Icon20Select } from '@telegram-apps/telegram-ui/dist/icons/20/select';

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
    caption: 'папки — строки среди заметок, кнопка «Папки» скрыта',
  },
  {
    value: 'button',
    label: 'Отдельная кнопка',
    caption: 'папок в списке нет, вход — кнопка «Папки»',
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
    label: 'Кнопкой в шапке',
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

interface OptionCellProps {
  label: string;
  caption: string;
  selected: boolean;
  onSelect: () => void;
}

/** Строка-вариант: тап выбирает, выбранный помечен галочкой цветом акцента. */
function OptionCell({ label, caption, selected, onSelect }: OptionCellProps) {
  return (
    <Cell
      Component="button"
      type="button"
      aria-pressed={selected}
      multiline
      // w-full обязателен: <button> не растягивается как блочный бокс —
      // короткий вариант не занял бы карточку, и галочка встала бы сразу за
      // подписью, а не у правого края.
      className="w-full"
      subtitle={caption}
      after={selected ? <Icon20Select className="h-5 w-5 text-ring" /> : undefined}
      onClick={onSelect}
    >
      {label}
    </Cell>
  );
}

export function SettingsSheet({ open = false, onClose }: SettingsSheetProps) {
  const foldersMode = useSettingsStore((s) => s.foldersMode);
  const pathMode = useSettingsStore((s) => s.pathMode);
  const editorMode = useSettingsStore((s) => s.editorMode);
  const editorView = useSettingsStore((s) => s.editorView);
  const swipeMode = useSettingsStore((s) => s.swipeMode);
  const formatPanel = useSettingsStore((s) => s.formatPanel);

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="px-2 pb-2 pt-1 text-lg font-semibold">Настройки</h2>
      {/* px-0! — снимаем собственные отступы List (10px 18px на iOS):
          горизонтальные отступы задаёт шторка, иначе карточки-секции
          уезжают к центру и становятся узкими. */}
      <List className="px-0!">
        <Section header="Папки">
          {modes.map((mode) => (
            <OptionCell
              key={mode.value}
              label={mode.label}
              caption={mode.caption}
              selected={foldersMode === mode.value}
              onSelect={() => {
                setFoldersMode(mode.value);
              }}
            />
          ))}
        </Section>
        <Section header="Путь к папке">
          {pathModes.map((mode) => (
            <OptionCell
              key={mode.value}
              label={mode.label}
              caption={mode.caption}
              selected={pathMode === mode.value}
              onSelect={() => {
                setPathMode(mode.value);
              }}
            />
          ))}
        </Section>
        <Section header="Редактирование заметки">
          {editorModes.map((mode) => (
            <OptionCell
              key={mode.value}
              label={mode.label}
              caption={mode.caption}
              selected={editorMode === mode.value}
              onSelect={() => {
                setEditorMode(mode.value);
              }}
            />
          ))}
        </Section>
        <Section header="Вид правки">
          {editorViews.map((view) => (
            <OptionCell
              key={view.value}
              label={view.label}
              caption={view.caption}
              selected={editorView === view.value}
              onSelect={() => {
                setEditorView(view.value);
              }}
            />
          ))}
        </Section>
        <Section header="Панель форматирования">
          {formatPanels.map((panel) => (
            <OptionCell
              key={panel.value}
              label={panel.label}
              caption={panel.caption}
              selected={formatPanel === panel.value}
              onSelect={() => {
                setFormatPanel(panel.value);
              }}
            />
          ))}
        </Section>
        <Section header="Перелистывание топиков">
          {swipeModes.map((mode) => (
            <OptionCell
              key={mode.value}
              label={mode.label}
              caption={mode.caption}
              selected={swipeMode === mode.value}
              onSelect={() => {
                setSwipeMode(mode.value);
              }}
            />
          ))}
        </Section>
      </List>
    </Modal>
  );
}
