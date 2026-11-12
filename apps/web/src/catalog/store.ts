import type { EngineOptions } from '@server-planner/engine';
import type { Catalog, CatalogApp, CatalogDevice, CatalogOs } from '@server-planner/model';
import { create } from 'zustand';

/**
 * catalogStore (docs/03 § 4.2): the effective catalog. For the MVP it is the base layer built
 * into the app (CAT-01) and loaded as a lazy chunk; downloaded updates (CAT-04) come with 1.1.
 */
export interface CatalogState {
  catalog: Catalog | null;
  load(): Promise<Catalog>;
}

let loading: Promise<Catalog> | null = null;

export const useCatalog = create<CatalogState>((set, get) => ({
  catalog: null,
  load() {
    const current = get().catalog;
    if (current) return Promise.resolve(current);
    loading ??= import('virtual:catalog').then((m) => {
      set({ catalog: m.default });
      return m.default;
    });
    return loading;
  },
}));

/** Engine inputs from the catalog (OS overhead per OS). */
export function engineOptions(catalog: Catalog | null): EngineOptions {
  if (!catalog) return {};
  return { osOverhead: Object.fromEntries(catalog.os.map((o) => [o.id, o.overhead])) };
}

export const catalogApp = (catalog: Catalog | null, id: string): CatalogApp | undefined =>
  catalog?.apps.find((a) => a.id === id);
export const catalogDevice = (catalog: Catalog | null, id: string): CatalogDevice | undefined =>
  catalog?.devices.find((d) => d.id === id);
export const catalogOs = (catalog: Catalog | null, id: string): CatalogOs | undefined =>
  catalog?.os.find((o) => o.id === id);
