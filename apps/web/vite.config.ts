import { catalogPlugin } from '@server-planner/catalog-builder/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { licensesPlugin } from './plugins/licenses';

/**
 * Content Security Policy for production builds (docs/03 § 10).
 * Not applied in dev: the React Fast Refresh preamble is an inline script.
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'server-planner-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      ),
  };
}

export default defineConfig({
  base: '/server-planner/',
  plugins: [
    react(),
    tailwindcss(),
    catalogPlugin(),
    licensesPlugin(import.meta.dirname),
    contentSecurityPolicy(),
    // Offline (docs/03 § 3): the app shell and the built-in catalog are precached. Catalog update
    // files (`catalog/*.json`) stay on the network so update checks see new versions (CAT-04).
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Server Planner',
        short_name: 'Server Planner',
        description: 'Plan your home lab: devices, network, capacity and traffic — in the browser.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#141414',
        theme_color: '#141414',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['catalog/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
