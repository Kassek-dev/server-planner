import {
  CatalogAppSchema,
  type CatalogDist,
  CatalogManifestSchema,
  CpuPerfFileSchema,
  versionAtLeast,
} from '@server-planner/model';
import { APP_VERSION } from '../persistence/backup';
import type { ProjectRepository } from '../persistence/repository';
import { newerVersion, useCatalog } from './store';

/**
 * Catalog updates in the app (CAT-04, docs/03 § 7.3): the manifest from the same origin, files
 * checked against its SHA-256 and the schemas, two versions kept for rollback. Checked at most
 * once a week (switchable off) or on demand.
 */

export interface CatalogUpdateState {
  current?: CatalogDist;
  previous?: CatalogDist;
  lastCheckAt?: string;
  autoCheck: boolean;
}

const KEY = 'catalog';
const WEEK_MS = 7 * 86_400_000;
export type CheckResult = 'updated' | 'up-to-date' | 'needs-newer-app' | 'unavailable' | 'invalid';

type Repo = Pick<ProjectRepository, 'getSetting' | 'setSetting'>;

export async function readUpdateState(repo: Repo): Promise<CatalogUpdateState> {
  return (await repo.getSetting<CatalogUpdateState>(KEY)) ?? { autoCheck: true };
}

/** At start-up: use a previously downloaded catalog (no network). */
export async function restoreDownloaded(repo: Repo): Promise<void> {
  const state = await readUpdateState(repo);
  if (state.current) useCatalog.getState().setDownloaded(state.current);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Base URL of the published dist (`<app>/catalog/`). */
export const catalogBaseUrl = () =>
  new URL('catalog/', new URL(import.meta.env.BASE_URL, location.origin)).href;

export async function checkForUpdate(
  repo: Repo,
  {
    fetchImpl = fetch,
    now = new Date(),
    base = catalogBaseUrl(),
  }: { fetchImpl?: typeof fetch; now?: Date; base?: string } = {},
): Promise<CheckResult> {
  const state = await readUpdateState(repo);
  const save = (next: Partial<CatalogUpdateState>) =>
    repo.setSetting(KEY, { ...state, ...next, lastCheckAt: now.toISOString() });
  let manifestText: string;
  try {
    const response = await fetchImpl(new URL('manifest.json', base), { cache: 'no-cache' });
    if (!response.ok) {
      await save({});
      return 'unavailable';
    }
    manifestText = await response.text();
  } catch {
    await save({});
    return 'unavailable';
  }
  try {
    const manifest = CatalogManifestSchema.parse(JSON.parse(manifestText));
    await useCatalog.getState().load();
    const { builtIn, downloaded } = useCatalog.getState();
    const known = [builtIn, downloaded].filter((d): d is CatalogDist => !!d);
    if (known.some((d) => !newerVersion(manifest.catalogVersion, d.manifest.catalogVersion))) {
      await save({});
      return 'up-to-date';
    }
    if (!versionAtLeast(APP_VERSION, manifest.minAppVersion)) {
      await save({});
      return 'needs-newer-app';
    }
    const file = async (name: string) => {
      const entry = manifest.files.find((f) => f.name === name);
      if (!entry) return undefined;
      const text = await (await fetchImpl(new URL(name, base), { cache: 'no-cache' })).text();
      if ((await sha256(text)) !== entry.sha256) throw new Error(`${name}: checksum mismatch`);
      return JSON.parse(text) as unknown;
    };
    const rawApps = (await file('apps.json')) ?? [];
    if (!Array.isArray(rawApps)) throw new Error('apps.json: expected a list');
    const apps = rawApps.map((a) => CatalogAppSchema.parse(a));
    const perfRaw = await file('perf.json');
    const dist: CatalogDist = {
      manifest,
      apps,
      ...(perfRaw ? { perf: CpuPerfFileSchema.parse(perfRaw) } : {}),
    };
    await save({ current: dist, ...(state.current ? { previous: state.current } : {}) });
    useCatalog.getState().setDownloaded(dist);
    return 'updated';
  } catch {
    await save({});
    return 'invalid';
  }
}

/** Start-up check: at most once every 7 days, unless switched off. */
export async function maybeCheckForUpdate(
  repo: Repo,
  now = new Date(),
): Promise<CheckResult | 'skipped'> {
  const state = await readUpdateState(repo);
  if (!state.autoCheck) return 'skipped';
  if (state.lastCheckAt && now.getTime() - Date.parse(state.lastCheckAt) < WEEK_MS)
    return 'skipped';
  return checkForUpdate(repo, { now });
}

export async function setAutoCheck(repo: Repo, autoCheck: boolean): Promise<void> {
  await repo.setSetting(KEY, { ...(await readUpdateState(repo)), autoCheck });
}

/** Back to the previous downloaded version, or to the catalog built into the app. */
export async function rollBack(repo: Repo): Promise<void> {
  const state = await readUpdateState(repo);
  const { current: _dropped, previous, ...rest } = state;
  await repo.setSetting(KEY, { ...rest, ...(previous ? { current: previous } : {}) });
  useCatalog.getState().setDownloaded(previous ?? null);
}
