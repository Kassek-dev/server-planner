import { catalogPlugin } from '@server-planner/catalog-builder/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
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
  ],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
