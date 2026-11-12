import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { useCatalog } from './store';
import { checkForUpdate, maybeCheckForUpdate, readUpdateState, rollBack } from './updates';

const memoryRepo = () => {
  const values = new Map<string, unknown>();
  return {
    getSetting: async <T>(key: string) => values.get(key) as T | undefined,
    setSetting: async (key: string, value: unknown) => void values.set(key, value),
  };
};
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const app = (id: string) => ({
  id,
  name: id,
  description: { en: id },
  categories: ['media'],
  source: ['linuxserver'],
  confidence: 'estimated',
  deployment: {
    kind: 'single',
    components: [
      {
        key: 'server',
        name: id,
        role: 'app',
        image: `lscr.io/linuxserver/${id}`,
        defaultTag: 'latest',
        arch: ['amd64'],
        platform: 'linux',
        listeners: [],
        volumes: [],
      },
    ],
  },
  requirements: {
    min: { cpu: 0.25, memoryBytes: 1, diskBytes: 1 },
    recommended: { cpu: 1, memoryBytes: 1, diskBytes: 1 },
  },
  dependencies: [],
  trafficPatterns: [],
  flows: [],
});

function server(version: string, { minAppVersion = '1.0.0', tamper = false } = {}) {
  const apps = JSON.stringify([app('newapp')]);
  const manifest = JSON.stringify({
    format: 'server-planner/catalog',
    schemaVersion: 1,
    catalogVersion: version,
    generatedAt: '2026-11-30T03:00:00.000Z',
    minAppVersion,
    files: [
      {
        name: 'apps.json',
        sha256: sha(tamper ? `${apps} ` : apps),
        bytes: apps.length,
        records: 1,
      },
    ],
    sources: [],
  });
  return (async (url: string | URL) => {
    const path = String(url);
    if (path.endsWith('manifest.json')) return new Response(manifest);
    if (path.endsWith('apps.json')) return new Response(apps);
    return new Response('', { status: 404 });
  }) as typeof fetch;
}
const base = 'https://example.test/server-planner/catalog/';

describe('catalog updates (CAT-04)', () => {
  it('downloads a newer, verified catalog and can roll back to the built-in one', async () => {
    const repo = memoryRepo();
    await useCatalog.getState().load();
    const builtIn = useCatalog.getState().catalog?.catalogVersion ?? '';
    expect(await checkForUpdate(repo, { fetchImpl: server('2099.01'), base })).toBe('updated');
    expect(useCatalog.getState().catalog?.catalogVersion).toBe('2099.01');
    expect(useCatalog.getState().catalog?.apps.some((a) => a.id === 'newapp')).toBe(true);
    expect((await readUpdateState(repo)).current?.manifest.catalogVersion).toBe('2099.01');

    expect(await checkForUpdate(repo, { fetchImpl: server('2099.01'), base })).toBe('up-to-date');
    await rollBack(repo);
    expect(useCatalog.getState().catalog?.catalogVersion).toBe(builtIn);
  });

  it('refuses tampered files and catalogs for newer apps', async () => {
    const repo = memoryRepo();
    expect(
      await checkForUpdate(repo, { fetchImpl: server('2099.02', { tamper: true }), base }),
    ).toBe('invalid');
    expect(
      await checkForUpdate(repo, {
        fetchImpl: server('2099.02', { minAppVersion: '99.0.0' }),
        base,
      }),
    ).toBe('needs-newer-app');
    const offline = (async () => {
      throw new TypeError('offline');
    }) as typeof fetch;
    expect(await checkForUpdate(repo, { fetchImpl: offline, base })).toBe('unavailable');
  });

  it('checks at most weekly at start-up', async () => {
    const repo = memoryRepo();
    await repo.setSetting('catalog', { autoCheck: true, lastCheckAt: '2026-11-12T00:00:00.000Z' });
    expect(await maybeCheckForUpdate(repo, new Date('2026-11-15T00:00:00.000Z'))).toBe('skipped');
    await repo.setSetting('catalog', { autoCheck: false });
    expect(await maybeCheckForUpdate(repo, new Date('2026-12-15T00:00:00.000Z'))).toBe('skipped');
  });
});
