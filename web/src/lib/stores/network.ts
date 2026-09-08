// Сетевое состояние: navigator.onLine + события online/offline.
// Используется для баннера «Нет сети» и подсказок при ошибках загрузки.
import { create } from 'zustand';

interface NetworkState {
  online: boolean;
}

export const useNetworkStore = create<NetworkState>()(() => ({
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
}));

/** Подписка на события сети; возвращает функцию отписки (для mount/unmount). */
export function initNetwork(): () => void {
  const onOnline = (): void => {
    useNetworkStore.setState({ online: true });
  };
  const onOffline = (): void => {
    useNetworkStore.setState({ online: false });
  };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
