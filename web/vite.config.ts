import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'],
      manifest: {
        name: 'Todo',
        short_name: 'Todo',
        description: 'Личный таск-менеджер',
        lang: 'ru',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        theme_color: '#3390ec',
        background_color: '#ffffff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Чтение через API: stale-while-revalidate, кэш только GET-запросов
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      // Во время разработки API бэкенда (cmd/bot, :8080)
      '/api': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'node',
    passWithNoTests: true,
    include: ['src/**/*.test.ts'],
    // Тесты работают с in-memory моком, а не с реальным API
    // (независимо от VITE_USE_MOCK из .env).
    env: { VITE_USE_MOCK: 'true' },
  },
});
