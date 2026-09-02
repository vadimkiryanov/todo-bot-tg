// Guard: /notifications доступен только авторизованным — иначе редирект на /login.
import { redirect } from '@sveltejs/kit';
import { ensureSession, session } from '$lib/stores/session.svelte';

export const load = async () => {
  await ensureSession();
  if (session.state !== 'authed') {
    throw redirect(307, '/login');
  }
};
