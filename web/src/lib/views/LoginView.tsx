// Вход/регистрация (URL /login). Telegram Login Widget (VITE_TG_LOGIN задаётся
// при сборке web) или форма логина/регистрации. Guard в App перенаправляет
// авторизованного в чат; после login/register здесь — явный переход на /.
import { useEffect, useState } from 'react';

import { login, register } from '../stores/session';
import { navigate } from '../router';

type Mode = 'login' | 'register';

export function LoginView() {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  // Вход через Telegram Login Widget (VITE_TG_LOGIN задаётся при сборке web).
  const tgLogin = import.meta.env.VITE_TG_LOGIN as string | undefined;
  const tgAuthUrl = `${window.location.origin}/api/v1/auth/tg`;
  const tgEnabled = !!tgLogin && window.location.protocol === 'https:';
  const [tgError, setTgError] = useState('');

  const title = mode === 'login' ? 'Вход' : 'Регистрация';

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error');
    if (err?.startsWith('telegram')) {
      setTgError('Не удалось войти через Telegram. Попробуйте ещё раз.');
    }
    if (!tgEnabled) return;
    const widget = document.getElementById('telegram-login-widget');
    if (!widget) return;

    // data-auth-url: виджет после входа переводит ОСНОВНОЕ окно на
    // /api/v1/auth/tg?data… — сервер ставит cookie и редиректит на /.
    // (data-onauth в этом конфиге замыкается на iframe виджета.)
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', tgLogin!);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '8');
    script.setAttribute('data-auth-url', tgAuthUrl);
    widget.appendChild(script);
  }, []);

  function switchMode(next: Mode): void {
    setMode(next);
    setError('');
  }

  async function submit(): Promise<void> {
    setError('');
    if (username.length < 3 || username.length > 32 || !/^[a-z0-9_]+$/.test(username)) {
      setError('Логин: 3–32 символа, только a-z, 0-9, _');
      return;
    }
    if (password.length < 8) {
      setError('Пароль: минимум 8 символов');
      return;
    }
    setPending(true);
    try {
      // Вход через session store (login/register применяют сессию сами),
      // после чего guard / перенаправляет авторизованного в чат.
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, password);
      }
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Что-то пошло не так');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
      <div className="text-6xl">📝</div>

      <div
        className="flex w-full max-w-xs items-center rounded-full bg-background p-1 text-sm"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          className={`h-9 flex-1 rounded-full transition-colors ${mode === 'login' ? 'bg-surface shadow' : 'text-muted'}`}
          onClick={() => switchMode('login')}
        >
          Вход
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          className={`h-9 flex-1 rounded-full transition-colors ${mode === 'register' ? 'bg-surface shadow' : 'text-muted'}`}
          onClick={() => switchMode('register')}
        >
          Регистрация
        </button>
      </div>

      {tgEnabled && (
        <div className="flex w-full max-w-xs flex-col items-center gap-3">
          <div className="flex w-full items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border"></span>
            или
            <span className="h-px flex-1 bg-border"></span>
          </div>
          <div id="telegram-login-widget"></div>
        </div>
      )}
      {tgError !== '' && <p className="text-sm text-danger">{tgError}</p>}

      <form
        className="flex w-full max-w-xs flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          className="h-11 rounded-xl border border-border bg-surface px-4 outline-none focus:border-accent"
          placeholder="Логин"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="h-11 rounded-xl border border-border bg-surface px-4 outline-none focus:border-accent"
          placeholder="Пароль"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error !== '' && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          className="h-11 rounded-xl bg-accent-strong font-medium text-white disabled:opacity-50"
          disabled={pending}
        >
          {pending ? '…' : title}
        </button>
      </form>
    </div>
  );
}
