<script lang="ts">
  import { onMount } from 'svelte';
  import { login as apiLogin, register as apiRegister } from '../lib/api/auth';
  import { showChat } from '../lib/stores/navigation.svelte';

  type Mode = 'login' | 'register';

  let mode = $state<Mode>('login');
  let username = $state('');
  let password = $state('');
  let pending = $state(false);
  let error = $state('');

  // Вход через Telegram Login Widget (VITE_TG_LOGIN задаётся при сборке web).
  const tgLogin = import.meta.env.VITE_TG_LOGIN as string | undefined;
  const tgAuthUrl = `${window.location.origin}/api/v1/auth/tg`;
  const tgEnabled = !!tgLogin && window.location.protocol === 'https:';
  let tgError = $state('');

  const title = $derived(mode === 'login' ? 'Вход' : 'Регистрация');

  onMount(() => {
    const err = new URLSearchParams(window.location.search).get('error');
    if (err?.startsWith('telegram')) {
      tgError = 'Не удалось войти через Telegram. Попробуйте ещё раз.';
    }
    if (!tgEnabled) return;
    const widget = document.getElementById('telegram-login-widget');
    if (!widget) return;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', tgLogin!);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '8');
    script.setAttribute('data-auth-url', tgAuthUrl);
    widget.appendChild(script);
  });

  function switchMode(next: Mode) {
    mode = next;
    error = '';
  }

  async function submit() {
    error = '';
    if (username.length < 3 || username.length > 32 || !/^[a-z0-9_]+$/.test(username)) {
      error = 'Логин: 3–32 символа, только a-z, 0-9, _';
      return;
    }
    if (password.length < 8) {
      error = 'Пароль: минимум 8 символов';
      return;
    }
    pending = true;
    try {
      if (mode === 'login') {
        await apiLogin(username, password);
      } else {
        await apiRegister(username, password);
      }
      showChat();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Что-то пошло не так';
    } finally {
      pending = false;
    }
  }
</script>

<div class="flex h-full flex-col items-center justify-center gap-6 px-6">
  <div class="text-6xl">📝</div>

  <div
    class="flex w-full max-w-xs items-center rounded-full bg-background p-1 text-sm"
    role="tablist"
  >
    <button
      type="button"
      role="tab"
      aria-selected={mode === 'login'}
      class="h-9 flex-1 rounded-full transition-colors {mode === 'login' ? 'bg-surface shadow' : 'text-muted'}"
      onclick={() => switchMode('login')}
    >
      Вход
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={mode === 'register'}
      class="h-9 flex-1 rounded-full transition-colors {mode === 'register' ? 'bg-surface shadow' : 'text-muted'}"
      onclick={() => switchMode('register')}
    >
      Регистрация
    </button>
  </div>

  {#if tgEnabled}
    <div class="flex w-full max-w-xs flex-col items-center gap-3">
      <div class="flex w-full items-center gap-3 text-xs text-muted">
        <span class="h-px flex-1 bg-border"></span>
        или
        <span class="h-px flex-1 bg-border"></span>
      </div>
      <div id="telegram-login-widget"></div>
    </div>
  {/if}
  {#if tgError}
    <p class="text-sm text-danger">{tgError}</p>
  {/if}

  <form
    class="flex w-full max-w-xs flex-col gap-3"
    onsubmit={(e) => {
      e.preventDefault();
      void submit();
    }}
  >
    <input
      class="h-11 rounded-xl border border-border bg-surface px-4 outline-none focus:border-accent"
      placeholder="Логин"
      autocomplete="username"
      bind:value={username}
    />
    <input
      class="h-11 rounded-xl border border-border bg-surface px-4 outline-none focus:border-accent"
      placeholder="Пароль"
      type="password"
      autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
      bind:value={password}
    />
    {#if error}
      <p class="text-sm text-danger">{error}</p>
    {/if}
    <button
      type="submit"
      class="h-11 rounded-xl bg-accent-strong font-medium text-white disabled:opacity-50"
      disabled={pending}
    >
      {pending ? '…' : title}
    </button>
  </form>
</div>
