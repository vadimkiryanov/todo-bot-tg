import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // SPA: вся сборка — статика; маршруты /login, /archive рендерятся на клиенте,
    // index.html отдаётся Caddy как fallback (try_files {path} /index.html).
    adapter: adapter({ fallback: 'index.html' }),
  },
};
