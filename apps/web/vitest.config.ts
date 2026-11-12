import { catalogPlugin } from '@server-planner/catalog-builder/vite';
import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';
import { licensesPlugin } from './plugins/licenses';

export default defineProject({
  plugins: [react(), catalogPlugin(), licensesPlugin(import.meta.dirname)],
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
