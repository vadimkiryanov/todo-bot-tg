// Guard: /login доступен только гостям — авторизованных редиректим в чат.
import { redirect } from '@sveltejs/kit';
import { ensureSession, session } from '$lib/stores/session.svelte';

export const load = async () => {
  await ensureSession();
  if (session.state === 'authed') {
    throw redirect(307, '/');
  }
};
