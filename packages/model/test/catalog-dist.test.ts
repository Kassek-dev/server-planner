import { describe, expect, it } from 'vitest';
import { type Catalog, type CatalogDist, normalizeCpuName, versionAtLeast, withDist } from '../src';

const cpu = { model: 'Intel Core i5-8500T', cores: 6, threads: 6, arch: 'amd64' as const };
const curated: Catalog = {
  format: 'server-planner/catalog',
  catalogVersion: '2026.46',
  generatedAt: '2026-11-12T00:00:00.000Z',
  apps: [{ id: 'jellyfin' } as Catalog['apps'][number]],
  devices: [
    {
      id: 'box',
      kind: 'mini-pc',
      vendor: 'X',
      model: 'Y',
      hardware: { cpus: [cpu], gpus: [] },
      formFactor: { mount: 'standalone', shape: 'mini-pc' },
      ports: [{ name: 'eth0', kind: 'rj45' }],
      source: ['curated'],
      confidence: 'curated',
    },
  ],
  cpus: [
    {
      ...cpu,
      id: 'intel-core-i5-8500t',
      vendor: 'intel',
      source: ['curated'],
      confidence: 'curated',
    },
  ],
  os: [],
};
const dist: CatalogDist = {
  manifest: {
    format: 'server-planner/catalog',
    schemaVersion: 1,
    catalogVersion: '2026.47',
    generatedAt: '2026-11-16T03:00:00.000Z',
    minAppVersion: '1.1.0',
    files: [],
    sources: [
      {
        id: 'blender',
        name: 'Blender Open Data',
        url: 'https://opendata.blender.org',
        license: 'CC0 1.0',
        status: 'ok',
        records: 2,
      },
    ],
  },
  apps: [
    { id: 'jellyfin', name: 'imported copy' } as Catalog['apps'][number],
    { id: 'lidarr' } as Catalog['apps'][number],
  ],
  perf: {
    reference: 'intel core i5-8500t',
    cpus: [
      {
        name: 'Intel Core i5-8500T CPU @ 2.10GHz',
        normalized: 'intel core i5-8500t',
        score: 100,
        samples: 21,
      },
    ],
  },
};

describe('effective catalog', () => {
  it('adds imported apps (curated win), CPU scores, version and sources', () => {
    const effective = withDist(curated, dist);
    expect(effective.apps.map((a) => a.id)).toEqual(['jellyfin', 'lidarr']);
    expect(effective.apps[0]).toBe(curated.apps[0]);
    expect(effective.cpus[0]?.perf).toEqual({
      score: 100,
      source: 'blender-opendata',
      samples: 21,
    });
    expect(effective.devices[0]?.hardware.cpus[0]?.perf?.score).toBe(100);
    expect(effective.catalogVersion).toBe('2026.47');
    expect(effective.sources?.[0]?.id).toBe('blender');
    expect(withDist(curated, null)).toBe(curated);
  });

  it('normalises CPU names and compares app versions', () => {
    expect(normalizeCpuName('Intel(R) Xeon(R) CPU E5-2650 v2 @ 2.60GHz')).toBe(
      'intel xeon e5-2650 v2',
    );
    expect(versionAtLeast('1.10.0', '1.9.2')).toBe(true);
    expect(versionAtLeast('1.0.0', '1.1.0')).toBe(false);
  });
});
