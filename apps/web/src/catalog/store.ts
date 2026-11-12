import type { EngineOptions } from '@server-planner/engine';
import {
  type Catalog,
  type CatalogApp,
  type CatalogDevice,
  type CatalogDist,
  type CatalogOs,
  withDist,
} from '@server-planner/model';
import { create } from 'zustand';

/**
 * catalogStore (docs/03 § 4.2): the effective catalog = curated layer + the newer of the dist built
 * into the app and a dist downloaded later (CAT-04, `catalog/updates.ts`). Loaded lazily.
 */
export interface CatalogState {
  catalog: Catalog | null;
  /** Dist built into this app version (null: curated only). */
  builtIn: CatalogDist | null;
  /** Newer dist downloaded by an update check, if any. */
  downloaded: CatalogDist | null;
  load(): Promise<Catalog>;
  /** Replaces the downloaded dist (update or rollback) and recomputes the catalog. */
  setDownloaded(dist: CatalogDist | null): void;
}

let curated: Catalog | null = null;
let loading: Promise<Catalog> | null = null;

/** "2026.46" vs "2026.45" — ISO year.week catalog versions. */
export function newerVersion(a: string, b: string): boolean {
  const [ay = 0, aw = 0] = a.split('.').map(Number);
  const [by = 0, bw = 0] = b.split('.').map(Number);
  return ay !== by ? ay > by : aw > bw;
}

const effective = (base: Catalog, builtIn: CatalogDist | null, downloaded: CatalogDist | null) =>
  withDist(
    base,
    downloaded &&
      (!builtIn ||
        newerVersion(downloaded.manifest.catalogVersion, builtIn.manifest.catalogVersion))
      ? downloaded
      : builtIn,
  );

export const useCatalog = create<CatalogState>((set, get) => ({
  catalog: null,
  builtIn: null,
  downloaded: null,
  load() {
    const current = get().catalog;
    if (current) return Promise.resolve(current);
    loading ??= import('virtual:catalog').then((m) => {
      curated = m.curated;
      const catalog = effective(m.curated, m.dist, get().downloaded);
      set({ catalog, builtIn: m.dist });
      return catalog;
    });
    return loading;
  },
  setDownloaded(dist) {
    set({ downloaded: dist });
    if (curated) set({ catalog: effective(curated, get().builtIn, dist) });
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
