/** Base catalog layer generated at build time from catalog/curated (packages/catalog-builder/src/vite.ts). */
declare module 'virtual:catalog' {
  import type { Catalog } from '@server-planner/model';

  const catalog: Catalog;
  export default catalog;
}

/** Production dependencies and their licenses, generated at build time (apps/web/plugins/licenses.ts). */
declare module 'virtual:licenses' {
  const licenses: { name: string; version: string; license: string; url?: string }[];
  export default licenses;
}
