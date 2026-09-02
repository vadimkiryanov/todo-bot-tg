<script lang="ts">
  // Корневой layout: офлайн-баннер, PWA, обработчик 401, восстановление сессии,
  // поллинг уведомлений (журнал сработавших напоминаний) для бейджа 🔔.
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { registerSW } from 'virtual:pwa-register';
  import { setUnauthorizedHandler } from '$lib/api/client';
  import { network, initNetwork } from '$lib/stores/network.svelte';
  import { clearSession, session } from '$lib/stores/session.svelte';
  import { loadNotifications } from '$lib/stores/notifications.svelte';

  // Любой 401 на запросах API → сброс сессии и возврат на экран входа.
  setUnauthorizedHandler(() => {
    clearSession();
    void goto('/login');
  });

  onMount(() => {
    registerSW({ immediate: true });
    return initNetwork();
  });

  // Авторизованным — периодический опрос журнала уведомлений: бейдж 🔔 в меню
  // обновляется, даже если напоминание сработало, пока вкладка была свёрнута.
  // Поллинг тихий (silent) — ошибки сети не трогают загруженный список.
  const NOTIFY_POLL_MS = 30_000;
  $effect(() => {
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
  });
</script>

<div class="h-full">
  {#if !network.online}
    <div
      class="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-danger px-3 pb-1 pt-[env(safe-area-inset-top)] text-sm text-white shadow"
    >
      <span>📡</span> Нет сети
    </div>
  {/if}

  <slot />
</div>
