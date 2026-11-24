import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode, command }) => {
  const androidRelease = mode === 'android-release';
  const adQa = command === 'serve' && mode === 'development'
    && loadEnv(mode, process.cwd(), 'VITE_').VITE_SHOW_PUBLISHER_CONSOLE === 'true';
  const production = androidRelease ? loadEnv('production', process.cwd(), 'VITE_') : {};
  const onlineOrigin = production.VITE_ONLINE_SERVER_URL?.trim() ?? '';
  const releaseAdMob = androidRelease ? {
    appId: production.VITE_ADMOB_APP_ID,
    rewardedUnitId: production.VITE_ADMOB_REWARDED_ID,
    interstitialUnitId: production.VITE_ADMOB_INTERSTITIAL_ID,
    bannerUnitId: production.VITE_ADMOB_BANNER_ID,
  } : null;

  if (releaseAdMob) {
    const publisher = /^ca-app-pub-(\d{16})~\d{10}$/.exec(releaseAdMob.appId ?? '')?.[1];
    const units = [releaseAdMob.rewardedUnitId, releaseAdMob.interstitialUnitId, releaseAdMob.bannerUnitId];
    if (!publisher || publisher === '3940256099942544'
        || units.some(id => !new RegExp(`^ca-app-pub-${publisher}/\\d{10}$`).test(id ?? ''))
        || new Set(units).size !== units.length) {
      throw new Error('Set the production AdMob app ID and three distinct ad unit IDs in .env.production.');
    }
    if (releaseAdMob.appId !== process.env.PEN_FIGHT_ANDROID_ADMOB_APP_ID) {
      throw new Error('VITE_ADMOB_APP_ID must match the Android release manifest ADMOB_APP_ID.');
    }
    if (production.VITE_ADMOB_TEST_MODE !== 'false') {
      throw new Error('Set VITE_ADMOB_TEST_MODE=false in .env.production.');
    }
    let endpoint: URL | undefined;
    try { endpoint = new URL(onlineOrigin); } catch { /* Explained below. */ }
    if (endpoint?.protocol !== 'https:' || endpoint.origin !== onlineOrigin.replace(/\/$/, '')) {
      throw new Error('Set VITE_ONLINE_SERVER_URL to the public HTTPS server origin in .env.production.');
    }
  }

  let outputDir = 'dist';
  return {
    define: {
      __AD_QA_ENABLED__: JSON.stringify(adQa),
      __ANDROID_RELEASE_ADS__: JSON.stringify(androidRelease),
      __ANDROID_ADMOB_CONFIG__: JSON.stringify(releaseAdMob),
      ...(androidRelease && {
        'import.meta.env.VITE_ONLINE_SERVER_URL': JSON.stringify(onlineOrigin),
      }),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'Pen Fight Aura Wars',
          short_name: 'Aura Wars',
          description:
            'Addictive one-thumb desk pen-flicking arcade game with 2D rigid-body spin physics, Tournament Ladder, and 2-Player Pass & Play.',
          theme_color: '#0B1120',
          background_color: '#0B1120',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          categories: ['games', 'arcade', 'sports'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          // OAuth opens API endpoints as browser pages. They must reach the server.
          navigateFallbackDenylist: [/^\/api(?:\/|$)/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      // Copies src/assets into dist/ so root-relative URLs still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, outputDir);
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
        },
        configResolved(config) {
          outputDir = config.build.outDir;
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: { '/api/online': 'http://127.0.0.1:3001' },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
