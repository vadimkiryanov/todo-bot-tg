<script lang="ts">
  import { onMount } from 'svelte';
  import { session, initSession, clearSession } from './lib/stores/session.svelte';
  import { navigation, showLogin } from './lib/stores/navigation.svelte';
  import { loadTopics } from './lib/stores/topics.svelte';
  import { setUnauthorizedHandler } from './lib/api/client';
  import LoginView from './views/LoginView.svelte';
  import ChatView from './views/ChatView.svelte';

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
  });
</script>

{#if session.state === 'loading'}
  <div class="flex h-full items-center justify-center text-muted">…</div>
{:else if session.state === 'guest' || navigation.screen === 'login'}
  <LoginView />
{:else}
  <ChatView />
{/if}
