// Настройки интерфейса (локальные, для устройства). Пока одна — режим
// показа папок на уровне списка заметок:
//   'list'   — папки текущего уровня показываются строками в общем списке
//              вместе с заметками (как в боте);
//   'button' — папки в списке не показываются, открываются кнопкой 📁 /
//              строкой текущей папки (прежнее поведение веба).
// Выбор хранится в localStorage и переживает перезагрузку страницы.
export type FoldersMode = 'list' | 'button';

const FOLDERS_MODE_KEY = 'todo.foldersMode';
const FOLDERS_MODE_DEFAULT: FoldersMode = 'list';

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

export const settings = $state<{ foldersMode: FoldersMode }>({
  foldersMode: readFoldersMode(),
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
