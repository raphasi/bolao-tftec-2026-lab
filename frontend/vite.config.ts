import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Service Worker injetado automaticamente; dev mode = SW desabilitado
      devOptions: { enabled: false },
      includeAssets: ['favicon.png', 'tftec-icon.png'],
      manifest: {
        name: 'Bolão TFTEC FIFA World Cup 2026',
        short_name: 'Bolão TFTEC',
        description: 'Bolão TFTEC Prime — palpites e leaderboard ao vivo da FIFA World Cup 2026',
        theme_color: '#1D1435',
        background_color: '#1D1435',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'pt-BR',
        icons: [
          {
            src: '/icons/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // S7.4: bandeiras agora estão em /flags/*.png (self-host) e entram automaticamente no precache.
        // Aumentei maximumFileSizeToCacheInBytes pra não cortar PNGs grandes.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB ceiling per file
        // API: NetworkFirst para GETs públicos (matches, leaderboard, groups) — fallback cache offline
        runtimeCaching: [
          {
            urlPattern: /\/api\/(matches|groups|leaderboard)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'bolao-public-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 5 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy /api -> backend Express na porta 3001 durante dev
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // false em prod: source maps publicados (.js.map → 200) expõem o código-fonte
    // completo, incluindo o painel admin (info disclosure / facilita recon de rotas).
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
  },
});
