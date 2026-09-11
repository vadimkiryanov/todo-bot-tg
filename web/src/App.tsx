// Корневой компонент: офлайн-баннер, PWA, обработчик 401, восстановление
// сессии, поллинг уведомлений (журнал сработавших напоминаний) для бейджа 🔔,
// микро-роутер с guard'ами сессии (паритет +page.ts: гость → /login, вход → /).
import { useEffect, type ReactNode } from 'react';
import { registerSW } from 'virtual:pwa-register';

import { setUnauthorizedHandler } from './lib/api/client';
import { ToastHost } from './lib/components/ToastHost';
import { initRouter, replacePath, useRouteStore } from './lib/router';
import { clearSession, initSession, useSessionStore } from './lib/stores/session';
import { initNetwork, useNetworkStore } from './lib/stores/network';
import { loadNotifications } from './lib/stores/notifications';
import { installPress } from './lib/utils/press';
import { ArchivedView } from './lib/views/ArchivedView';
import { ChatView } from './lib/views/ChatView';
import { DoneView } from './lib/views/DoneView';
import { LoginView } from './lib/views/LoginView';
import { NotificationsView } from './lib/views/NotificationsView';
import { TimersView } from './lib/views/TimersView';

// Авторизованным — периодический опрос журнала уведомлений: бейдж 🔔 в меню
// обновляется, даже если напоминание сработало, пока вкладка была свёрнута.
// Поллинг тихий (silent) — ошибки сети не трогают загруженный список.
const NOTIFY_POLL_MS = 30_000;

function OfflineBanner() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-destructive px-3 pb-1 pt-[env(safe-area-inset-top)] text-sm text-white shadow">
      <span>📡</span> Нет сети
    </div>
  );
}

export function App() {
  const online = useNetworkStore((s) => s.online);
  const session = useSessionStore((s) => s.session);
  const path = useRouteStore((s) => s.path);

  // Одноразовая инициализация: 401 → сброс сессии и на экран входа, PWA,
  // подписки на сеть, навигацию (popstate) и отклик нажатий, восстановление
  // сессии.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      replacePath('/login');
    });
    registerSW({ immediate: true });
    const stopNetwork = initNetwork();
    const stopRouter = initRouter();
    const stopPress = installPress();
    void initSession();
    return () => {
      stopNetwork();
      stopRouter();
      stopPress();
    };
  }, []);

  // Поллинг уведомлений для авторизованных (паритет $effect в +layout.svelte).
  useEffect(() => {
    if (session.state !== 'authed') return;
    let stopped = false;
    void loadNotifications(true);
    const timer = setInterval(() => {
      if (!stopped && !document.hidden) void loadNotifications(true);
    }, NOTIFY_POLL_MS);
    const onVisible = (): void => {
      if (!document.hidden) void loadNotifications(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session.state]);

  // Guard'ы сессии (паритет +page.ts): гостя ведём на /login, авторизованного
  // с /login — в чат. Редиректы — replacePath (без истории), как 307.
  useEffect(() => {
    if (session.state === 'guest' && path !== '/login') {
      replacePath('/login');
    } else if (session.state === 'authed' && path === '/login') {
      replacePath('/');
    }
  }, [session.state, path]);

  let screen: ReactNode;
  if (session.state === 'authed') {
    switch (path) {
      case '/archive':
        screen = <ArchivedView />;
        break;
      case '/done':
        screen = <DoneView />;
        break;
      case '/notifications':
        screen = <NotificationsView />;
        break;
      case '/timers':
        screen = <TimersView />;
        break;
      default:
        // '/login' и неизвестные пути: guard выше уводит с /login, остальное — чат.
        screen = <ChatView />;
    }
  } else if (session.state === 'guest') {
    // Гость: показываем вход; редирект-эффект выше правит URL защищённых путей.
    screen = <LoginView />;
  } else {
    // loading — сессия восстанавливается (GET /me): пустой экран, как в Svelte,
    // где страницы ждали ensureSession до первого рендера.
    screen = null;
  }

  return (
    <div className="h-full">
      {!online && <OfflineBanner />}
      {screen}
      <ToastHost />
    </div>
  );
}
