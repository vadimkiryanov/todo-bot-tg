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
// Выбор хранится в localStorage и переживает перезагрузку страницы.
export type FoldersMode = 'list' | 'button';
export type PathMode = 'tab' | 'strip';

const FOLDERS_MODE_KEY = 'todo.foldersMode';
const FOLDERS_MODE_DEFAULT: FoldersMode = 'list';
const PATH_MODE_KEY = 'todo.pathMode';
const PATH_MODE_DEFAULT: PathMode = 'tab';

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

export const settings = $state<{ foldersMode: FoldersMode; pathMode: PathMode }>({
  foldersMode: readFoldersMode(),
  pathMode: readPathMode(),
});

export function setFoldersMode(mode: FoldersMode): void {
  settings.foldersMode = mode;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(FOLDERS_MODE_KEY, mode);
  } catch {
    // localStorage недоступен — режим живёт до перезагрузки страницы
  }
}

export function setPathMode(mode: PathMode): void {
  settings.pathMode = mode;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PATH_MODE_KEY, mode);
  } catch {
    // localStorage недоступен — режим живёт до перезагрузки страницы
  }
}
