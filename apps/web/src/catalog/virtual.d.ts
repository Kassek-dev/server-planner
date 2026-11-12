/** Catalog built into the app (packages/catalog-builder/src/vite.ts). */
declare module 'virtual:catalog' {
  import type { Catalog, CatalogDist } from '@server-planner/model';

  /** The curated layer (catalog/curated). */
  export const curated: Catalog;
  /** What the weekly builder published in catalog/dist, if anything. */
  export const dist: CatalogDist | null;
}

/** Production dependencies and their licenses, generated at build time (apps/web/plugins/licenses.ts). */
declare module 'virtual:licenses' {
  const licenses: { name: string; version: string; license: string; url?: string }[];
  export default licenses;
}
