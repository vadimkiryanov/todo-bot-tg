<script lang="ts">
  // Корневой layout: офлайн-баннер, PWA, обработчик 401, восстановление сессии.
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { registerSW } from 'virtual:pwa-register';
  import { setUnauthorizedHandler } from '$lib/api/client';
  import { network, initNetwork } from '$lib/stores/network.svelte';
  import { clearSession } from '$lib/stores/session.svelte';

  // Любой 401 на запросах API → сброс сессии и возврат на экран входа.
  setUnauthorizedHandler(() => {
    clearSession();
    void goto('/login');
  });

  onMount(() => {
    registerSW({ immediate: true });
    return initNetwork();
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
