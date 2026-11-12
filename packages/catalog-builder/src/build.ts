import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { CURATED_DIR, isoWeekVersion, loadCurated, normalizeSizes } from './curated';
import { createFetchContext } from './http';
import { type CpuPerf, cpuScores, type Heuristics, mergeApps } from './merge';
import { SOURCES } from './sources';
import type { AppRecord, CpuPerfRecord, SourceRecord } from './sources/types';

/**
 * `pnpm catalog:build [--force] [--only <id>] [--dry-run]` — docs/03 § 7.1.
 * Exit codes: 0 done or skipped, 1 error, 2 safeguard tripped (the workflow opens an Issue).
 */

export const CATALOG_DIR = resolve(CURATED_DIR, '..');
/** Runs closer together than this are skipped unless --force (D7: at most weekly). */
const LOCK_DAYS = 7;
/** Records of a source may drop by at most this share between runs (docs/03 § 7.1 step 5). */
const MAX_DROP = 0.2;
/** Oldest app version able to read this dist format. */
export const MIN_APP_VERSION = '1.1.0';

export interface SourceStatus {
  id: string;
  name: string;
  url: string;
  license: string;
  status: 'ok' | 'failed' | 'stale';
  fetchedAt?: string;
  records: number;
  error?: string;
}

export interface Manifest {
  format: 'server-planner/catalog';
  schemaVersion: 1;
  catalogVersion: string;
  generatedAt: string;
  minAppVersion: string;
  files: { name: string; sha256: string; bytes: number; records: number }[];
  sources: SourceStatus[];
}

export interface PerfFile {
  reference: string;
  cpus: CpuPerf[];
}

const readJson = async <T>(path: string): Promise<T | undefined> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
};
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export interface BuildOptions {
  force?: boolean;
  only?: string;
  dryRun?: boolean;
  now?: Date;
  log?: (line: string) => void;
  /** Tests: another catalog folder (with `curated/`) and other sources. */
  catalogDir?: string;
  sources?: typeof SOURCES;
}

export async function buildCatalog(options: BuildOptions = {}): Promise<number> {
  const now = options.now ?? new Date();
  const log = options.log ?? console.log;
  const catalogDir = options.catalogDir ?? CATALOG_DIR;
  const curatedDir = join(catalogDir, 'curated');
  const distDir = join(catalogDir, 'dist');
  const stateFile = join(catalogDir, 'state.json');
  const state = await readJson<{ lastSuccessAt?: string }>(stateFile);
  if (state?.lastSuccessAt && !options.force && !options.dryRun) {
    const days = (now.getTime() - Date.parse(state.lastSuccessAt)) / 86_400_000;
    if (days < LOCK_DAYS) {
      log(`catalog:build — skipped, last run ${days.toFixed(1)} days ago (use --force).`);
      return 0;
    }
  }

  const { catalog: curated, errors } = await loadCurated(curatedDir, now);
  if (errors.length > 0) {
    for (const e of errors) log(`  ${e.file}: ${e.message}`);
    log('catalog:build — curated layer is invalid, run pnpm catalog:validate.');
    return 1;
  }
  const heuristics = normalizeSizes(
    parse(await readFile(join(curatedDir, 'heuristics.yml'), 'utf8')),
  ) as Heuristics;
  const aliases = (parse(await readFile(join(curatedDir, 'app-aliases.yml'), 'utf8')) ??
    {}) as Record<string, string[]>;

  const previousManifest = await readJson<Manifest>(join(distDir, 'manifest.json'));
  const previousApps = (await readJson<unknown[]>(join(distDir, 'apps.json'))) ?? [];
  const previousPerf = await readJson<PerfFile>(join(distDir, 'perf.json'));

  const work = await mkdtemp(join(tmpdir(), 'catalog-build-'));
  const records = new Map<string, SourceRecord[]>();
  const statuses: SourceStatus[] = [];
  try {
    for (const { adapter, budget } of options.sources ?? SOURCES) {
      const base = {
        id: adapter.id,
        name: adapter.name,
        url: adapter.url,
        license: adapter.license,
      };
      const previous = previousManifest?.sources.find((s) => s.id === adapter.id);
      if (options.only && options.only !== adapter.id) {
        if (previous) statuses.push({ ...previous, status: 'stale' });
        continue;
      }
      log(`→ ${adapter.id}`);
      try {
        const raw = await adapter.fetch(createFetchContext(join(work, adapter.id), budget));
        const list = await adapter.normalize(raw);
        records.set(adapter.id, list);
        statuses.push({
          ...base,
          status: 'ok',
          fetchedAt: now.toISOString(),
          records: list.length,
        });
        log(`  ${list.length} records`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        statuses.push({
          ...base,
          status: 'failed',
          records: previous?.records ?? 0,
          error: message,
          ...(previous?.fetchedAt ? { fetchedAt: previous.fetchedAt } : {}),
        });
        log(`  failed: ${message}`);
      }
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }

  // Safeguard: a source that suddenly returns far fewer records is more likely broken than right.
  const tripped = statuses.filter((s) => {
    const before = previousManifest?.sources.find((p) => p.id === s.id)?.records ?? 0;
    return s.status === 'ok' && before > 0 && s.records < before * (1 - MAX_DROP);
  });
  if (tripped.length > 0) {
    for (const s of tripped) {
      const before = previousManifest?.sources.find((p) => p.id === s.id)?.records ?? 0;
      log(
        `SAFEGUARD: ${s.id} dropped from ${before} to ${s.records} records (> ${MAX_DROP * 100}%).`,
      );
    }
    return 2;
  }

  // Apps need all three app sources from this run; otherwise the previous apps stay.
  const appSources = ['linuxserver', 'awesome-selfhosted', 'community-scripts'];
  const appsFresh = appSources.every((id) => statuses.find((s) => s.id === id)?.status === 'ok');
  let apps = previousApps;
  if (appsFresh) {
    const merged = mergeApps({
      records: appSources.flatMap((id) => (records.get(id) ?? []) as AppRecord[]),
      curated: curated.apps,
      aliases,
      heuristics,
    });
    for (const r of merged.rejected) log(`  rejected ${r.key}: ${r.reason}`);
    if (previousApps.length > 0 && merged.apps.length < previousApps.length * (1 - MAX_DROP)) {
      log(`SAFEGUARD: imported apps dropped from ${previousApps.length} to ${merged.apps.length}.`);
      return 2;
    }
    apps = merged.apps;
  } else {
    for (const s of statuses)
      if (appSources.includes(s.id) && s.status === 'ok') s.status = 'stale';
  }
  const blender = records.get('blender') as CpuPerfRecord[] | undefined;
  const perf: PerfFile | undefined = blender
    ? { reference: heuristics.cpuReference, cpus: cpuScores(blender, heuristics.cpuReference) }
    : previousPerf;

  const appsText = `${JSON.stringify(apps, null, 1)}\n`;
  const perfText = perf ? `${JSON.stringify(perf, null, 1)}\n` : undefined;
  const unchanged =
    previousManifest?.files.find((f) => f.name === 'apps.json')?.sha256 === sha256(appsText) &&
    (!perfText ||
      previousManifest?.files.find((f) => f.name === 'perf.json')?.sha256 === sha256(perfText));

  const before = new Set((previousApps as { id: string }[]).map((a) => a.id));
  const after = new Set((apps as { id: string }[]).map((a) => a.id));
  const changelog = {
    catalogVersion: isoWeekVersion(now),
    generatedAt: now.toISOString(),
    added: [...after].filter((id) => !before.has(id)).sort(),
    removed: [...before].filter((id) => !after.has(id)).sort(),
    sources: statuses.map((s) => ({
      id: s.id,
      status: s.status,
      records: s.records,
      ...(s.error ? { error: s.error } : {}),
    })),
  };
  log(
    `catalog:build — ${apps.length} imported apps, ${perf?.cpus.length ?? 0} CPU scores; +${changelog.added.length} / -${changelog.removed.length}.`,
  );
  if (options.dryRun) return 0;
  if (unchanged && previousManifest) {
    log('catalog:build — no data changes, dist left as is.');
    return 0;
  }

  await mkdir(distDir, { recursive: true });
  const files: Manifest['files'] = [];
  const write = async (name: string, text: string, count: number) => {
    await writeFile(join(distDir, name), text);
    files.push({ name, sha256: sha256(text), bytes: Buffer.byteLength(text), records: count });
  };
  await write('apps.json', appsText, apps.length);
  if (perfText && perf) await write('perf.json', perfText, perf.cpus.length);
  const manifest: Manifest = {
    format: 'server-planner/catalog',
    schemaVersion: 1,
    catalogVersion: changelog.catalogVersion,
    generatedAt: now.toISOString(),
    minAppVersion: MIN_APP_VERSION,
    files,
    sources: statuses,
  };
  await writeFile(join(distDir, 'CHANGELOG.json'), `${JSON.stringify(changelog, null, 1)}\n`);
  await writeFile(join(distDir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  if (statuses.some((s) => s.status === 'ok'))
    await writeFile(
      stateFile,
      `${JSON.stringify({ lastSuccessAt: now.toISOString(), catalogVersion: manifest.catalogVersion }, null, 1)}\n`,
    );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
  buildCatalog({
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run'),
    ...(only ? { only } : {}),
  })
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
