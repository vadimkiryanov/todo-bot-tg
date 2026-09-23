// Корневой компонент: офлайн-баннер, PWA, обработчик 401, восстановление
// сессии, разовая загрузка уведомлений (журнал сработавших напоминаний) для
// бейджа «Меню», микро-роутер с guard'ами сессии (паритет +page.ts:
// гость → /login, вход → /).
import { useEffect, type ReactNode } from 'react';
import { AppRoot } from '@telegram-apps/telegram-ui';
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

// Авторизованным — разовая загрузка журнала уведомлений: счётчик непрочитанных
// на кнопке «Меню» верен сразу после входа. Фонового обновления нет —
// перезагрузка списка происходит при заходе на экран «Уведомления»
// (NotificationsView) или при переходе в него из бургер-меню.

function OfflineBanner() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-destructive px-3 pb-1 pt-[env(safe-area-inset-top)] text-sm text-white shadow">
      Нет сети
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

  // Уведомления для авторизованных: журнал читается один раз при входе —
  // бейдж «Меню» сразу показывает непрочитанные. Фонового обновления нет.
  useEffect(() => {
    if (session.state !== 'authed') return;
    void loadNotifications(true);
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
    // AppRoot @telegram-apps/telegram-ui — единственное место, где объявлена
    // платформа библиотеки: он навешивает классы с токенами --tgui--*, которые
    // наследуют все строки-Cell и шторки. Вне Telegram библиотека определяет
    // платформу как base (Material) — берём ios: серые заголовки секций и
    // карточки-секции, как в iOS-клиенте. Своих стилей (фон, шрифт) класс
    // AppRoot не задаёт, поэтому видеть его в корне безопасно.
    <AppRoot platform="ios" className="h-full">
      {!online && <OfflineBanner />}
      {screen}
      <ToastHost />
    </AppRoot>
  );
}
