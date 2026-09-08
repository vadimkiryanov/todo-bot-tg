// Микро-роутер по URL-пути (вместо react-router): Caddy раздаёт index.html
// на все пути (try_files … /index.html), переходы — history.pushState,
// назад/вперёд — popstate. Query (?topic=&folder=&note=) роутер не трогает:
// её зеркалит ChatView для паритета ссылок.
import { create } from 'zustand';

interface RouteState {
  path: string;
}

export const useRouteStore = create<RouteState>()(() => ({
  path: typeof window !== 'undefined' ? window.location.pathname : '/',
}));

/** Текущий путь (для не-реактивных мест). */
export function currentPath(): string {
  return useRouteStore.getState().path;
}

function syncPath(): void {
  useRouteStore.setState({ path: window.location.pathname });
}

/** Переход на путь: новая запись в истории браузера. */
export function navigate(path: string): void {
  if (window.location.pathname === path) return;
  window.history.pushState(null, '', path);
  syncPath();
}

/** Заменить текущий путь без новой записи истории. */
export function replacePath(path: string): void {
  if (window.location.pathname === path) return;
  window.history.replaceState(null, '', path);
  syncPath();
}

let installed = false;
/** Подписка на popstate (назад/вперёд). Вызывается один раз из App. */
export function initRouter(): () => void {
  if (installed) return () => {};
  installed = true;
  window.addEventListener('popstate', syncPath);
  return () => {
    installed = false;
    window.removeEventListener('popstate', syncPath);
  };
}
