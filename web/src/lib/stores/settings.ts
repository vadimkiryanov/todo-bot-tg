// Настройки интерфейса (локальные, для устройства).
//   foldersMode — показ папок текущего уровня на списке заметок:
//     'list'   — папки показываются строками в общем списке вместе с
//                заметками (как в боте);
//     'button' — папки в списке не показываются, открываются кнопкой 📁 /
//                строкой текущей папки.
//   pathMode — где показывается текущее местоположение (путь в папках):
//     'tab'   — путь расширяет активный таб «островка» топиков
//                (новое поведение по умолчанию);
//     'strip' — отдельной строкой-«хлебной крошкой» под островком
//                (прежнее поведение).
//   editorMode — как открывается редактирование заметки (NotePage):
//     'tap'    — тапом по тексту заметки (поле ввода включается сразу);
//     'toggle' — кнопкой ✏️/👁 в шапке (превью и редактирование
//                переключаются явно, тап по тексту ничего не меняет).
//   editorView — как выглядит поле правки заметки:
//     'formatted' — разметка скрыта, вместо неё оформление (заголовки,
//                   списки, чеклист, жирный/курсив/код/ссылка) — по умолчанию;
//     'plain'     — текст с markdown-разметкой (как раньше).
//   swipeMode — как переключаются топики свайпом по ленте:
//     'slide' — контент уезжает вбок (как раньше);
//     'fade'  — контент не едет: заметки проявляются друг через друга
//               (на середине свайпа оба слайда полупрозрачны); за пальцем
//               едет только капсула островка.
//   formatPanel — показывать ли панель форматирования в футере правки
//                 заметки (кнопки оформления и подсказка под ними):
//     'show' — панель на месте (как раньше);
//     'hide' — панели нет: текст правки без ряда кнопок оформления.
// Выбор хранится в localStorage и переживает перезагрузку страницы.
import { create } from 'zustand';

export type FoldersMode = 'list' | 'button';
export type PathMode = 'tab' | 'strip';
export type EditorMode = 'tap' | 'toggle';
export type EditorView = 'formatted' | 'plain';
export type SwipeMode = 'slide' | 'fade';
export type FormatPanel = 'show' | 'hide';

const FOLDERS_MODE_KEY = 'todo.foldersMode';
const FOLDERS_MODE_DEFAULT: FoldersMode = 'list';
const PATH_MODE_KEY = 'todo.pathMode';
const PATH_MODE_DEFAULT: PathMode = 'tab';
const EDITOR_MODE_KEY = 'todo.editorMode';
const EDITOR_MODE_DEFAULT: EditorMode = 'tap';
const EDITOR_VIEW_KEY = 'todo.editorView';
const EDITOR_VIEW_DEFAULT: EditorView = 'formatted';
const SWIPE_MODE_KEY = 'todo.swipeMode';
const SWIPE_MODE_DEFAULT: SwipeMode = 'slide';
const FORMAT_PANEL_KEY = 'todo.formatPanel';
const FORMAT_PANEL_DEFAULT: FormatPanel = 'show';

function readFoldersMode(): FoldersMode {
  // В node (тесты) localStorage отсутствует — всегда значение по умолчанию.
  if (typeof localStorage === 'undefined') return FOLDERS_MODE_DEFAULT;
  try {
    const raw = localStorage.getItem(FOLDERS_MODE_KEY);
    return raw === 'button' ? 'button' : FOLDERS_MODE_DEFAULT;
  } catch {
    return FOLDERS_MODE_DEFAULT;
  }
}

function readPathMode(): PathMode {
  if (typeof localStorage === 'undefined') return PATH_MODE_DEFAULT;
  try {
    const raw = localStorage.getItem(PATH_MODE_KEY);
    return raw === 'strip' ? 'strip' : PATH_MODE_DEFAULT;
  } catch {
    return PATH_MODE_DEFAULT;
  }
}

function readEditorMode(): EditorMode {
  if (typeof localStorage === 'undefined') return EDITOR_MODE_DEFAULT;
  try {
    const raw = localStorage.getItem(EDITOR_MODE_KEY);
    return raw === 'toggle' ? 'toggle' : EDITOR_MODE_DEFAULT;
  } catch {
    return EDITOR_MODE_DEFAULT;
  }
}

function readEditorView(): EditorView {
  if (typeof localStorage === 'undefined') return EDITOR_VIEW_DEFAULT;
  try {
    const raw = localStorage.getItem(EDITOR_VIEW_KEY);
    return raw === 'plain' ? 'plain' : EDITOR_VIEW_DEFAULT;
  } catch {
    return EDITOR_VIEW_DEFAULT;
  }
}

function readSwipeMode(): SwipeMode {
  if (typeof localStorage === 'undefined') return SWIPE_MODE_DEFAULT;
  try {
    const raw = localStorage.getItem(SWIPE_MODE_KEY);
    return raw === 'fade' ? 'fade' : SWIPE_MODE_DEFAULT;
  } catch {
    return SWIPE_MODE_DEFAULT;
  }
}

function readFormatPanel(): FormatPanel {
  if (typeof localStorage === 'undefined') return FORMAT_PANEL_DEFAULT;
  try {
    const raw = localStorage.getItem(FORMAT_PANEL_KEY);
    return raw === 'hide' ? 'hide' : FORMAT_PANEL_DEFAULT;
  } catch {
    return FORMAT_PANEL_DEFAULT;
  }
}

interface SettingsState {
  foldersMode: FoldersMode;
  pathMode: PathMode;
  editorMode: EditorMode;
  editorView: EditorView;
  swipeMode: SwipeMode;
  formatPanel: FormatPanel;
}

export const useSettingsStore = create<SettingsState>()(() => ({
  foldersMode: readFoldersMode(),
  pathMode: readPathMode(),
  editorMode: readEditorMode(),
  editorView: readEditorView(),
  swipeMode: readSwipeMode(),
  formatPanel: readFormatPanel(),
}));

export function setFoldersMode(mode: FoldersMode): void {
  useSettingsStore.setState({ foldersMode: mode });
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(FOLDERS_MODE_KEY, mode);
  } catch {
    // localStorage недоступен — режим живёт до перезагрузки страницы
  }
}

export function setPathMode(mode: PathMode): void {
  useSettingsStore.setState({ pathMode: mode });
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PATH_MODE_KEY, mode);
  } catch {
    // localStorage недоступен — режим живёт до перезагрузки страницы
  }
}

export function setEditorMode(mode: EditorMode): void {
  useSettingsStore.setState({ editorMode: mode });
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(EDITOR_MODE_KEY, mode);
  } catch {
    // localStorage недоступен — режим живёт до перезагрузки страницы
  }
}

export function setEditorView(mode: EditorView): void {
  useSettingsStore.setState({ editorView: mode });
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(EDITOR_VIEW_KEY, mode);
  } catch {
    // localStorage недоступен — режим живёт до перезагрузки страницы
  }
}

export function setSwipeMode(mode: SwipeMode): void {
  useSettingsStore.setState({ swipeMode: mode });
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SWIPE_MODE_KEY, mode);
  } catch {
    // localStorage недоступен — режим живёт до перезагрузки страницы
  }
}

export function setFormatPanel(mode: FormatPanel): void {
  useSettingsStore.setState({ formatPanel: mode });
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(FORMAT_PANEL_KEY, mode);
  } catch {
    // localStorage недоступен — режим живёт до перезагрузки страницы
  }
}
