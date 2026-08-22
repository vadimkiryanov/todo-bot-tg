<script lang="ts">
  import { onMount } from 'svelte';
  import { session, initSession, clearSession } from './lib/stores/session.svelte';
  import { navigation, showLogin } from './lib/stores/navigation.svelte';
  import { network, initNetwork } from './lib/stores/network.svelte';
  import { loadTopics } from './lib/stores/topics.svelte';
  import { setUnauthorizedHandler } from './lib/api/client';
  import LoginView from './views/LoginView.svelte';
  import ChatView from './views/ChatView.svelte';
  import ArchivedView from './views/ArchivedView.svelte';

  // Любой 401 на запросах API → возврат на экран входа.
  setUnauthorizedHandler(() => {
    clearSession();
    showLogin();
  });

  // При авторизации (старт или вход) — загружаем топики.
  $effect(() => {
    if (session.state === 'authed') {
      void loadTopics();
    }
  });

  onMount(() => {
    initSession();
    return initNetwork();
  });
</script>

{#if !network.online}
  <div
    class="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-danger px-3 pb-1 pt-[env(safe-area-inset-top)] text-sm text-white shadow"
  >
    <span>📡</span> Нет сети
  </div>
{/if}

{#if session.state === 'loading'}
  <div class="flex h-full items-center justify-center text-muted">…</div>
{:else if session.state === 'guest' || navigation.screen === 'login'}
  <LoginView />
{:else if navigation.screen === 'archived'}
  <ArchivedView />
{:else}
  <ChatView />
{/if}
