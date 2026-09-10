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
// Выбор хранится в localStorage и переживает перезагрузку страницы.
import { create } from 'zustand';

export type FoldersMode = 'list' | 'button';
export type PathMode = 'tab' | 'strip';
export type EditorMode = 'tap' | 'toggle';

const FOLDERS_MODE_KEY = 'todo.foldersMode';
const FOLDERS_MODE_DEFAULT: FoldersMode = 'list';
const PATH_MODE_KEY = 'todo.pathMode';
const PATH_MODE_DEFAULT: PathMode = 'tab';
const EDITOR_MODE_KEY = 'todo.editorMode';
const EDITOR_MODE_DEFAULT: EditorMode = 'tap';

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

interface SettingsState {
  foldersMode: FoldersMode;
  pathMode: PathMode;
  editorMode: EditorMode;
}

export const useSettingsStore = create<SettingsState>()(() => ({
  foldersMode: readFoldersMode(),
  pathMode: readPathMode(),
  editorMode: readEditorMode(),
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
