// Сетевое состояние: navigator.onLine + события online/offline.
// Используется для баннера «Нет сети» и подсказок при ошибках загрузки.
export const network = $state<{ online: boolean }>({
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
});

/** Подписка на события сети; возвращает функцию отписки (для onMount). */
export function initNetwork(): () => void {
  const onOnline = (): void => {
    network.online = true;
  };
  const onOffline = (): void => {
    network.online = false;
  };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
