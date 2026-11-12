import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog, type Manifest } from '../src/build';
import { CURATED_DIR, loadCurated } from '../src/curated';
import { categoriesFor, cpuScores, mergeApps } from '../src/merge';
import { awesomeSelfhostedSource } from '../src/sources/awesomeSelfhosted';
import { aggregate, normalizeCpuName } from '../src/sources/blender';
import { communityScriptsSource } from '../src/sources/communityScripts';
import { linuxserverSource } from '../src/sources/linuxserver';
import type { AppRecord, SourceAdapter } from '../src/sources/types';

const samples = join(import.meta.dirname, 'samples');
const text = (path: string) => readFile(join(samples, path), 'utf8');
const files = async (...paths: string[]) =>
  Promise.all(paths.map(async (p) => ({ path: `repo/${p}`, text: await text(p) })));
async function* linesOf(path: string) {
  for (const line of (await text(path)).split('\n')) yield line;
}
const heuristics = {
  excludeImages: ['qemu-static'],
  lxcToDocker: { memoryFactor: 0.75, cpuFactor: 1, osDiskGb: 2, minDiskGb: 1 },
  defaultRequirements: {
    min: { cpu: 0.25, memoryBytes: 256 * 1024 ** 2, diskBytes: 1e9 },
    recommended: { cpu: 1, memoryBytes: 512 * 1024 ** 2, diskBytes: 2e9 },
  },
  cpuReference: 'intel core i5-8500t',
};

async function sampleRecords(): Promise<AppRecord[]> {
  return [
    ...((await linuxserverSource.normalize(
      JSON.parse(await text('linuxserver.json')),
    )) as AppRecord[]),
    ...((await awesomeSelfhostedSource.normalize(
      await files(
        'awesome-selfhosted/software/lidarr.yml',
        'awesome-selfhosted/software/no-docker.yml',
      ),
    )) as AppRecord[]),
    ...((await communityScriptsSource.normalize(
      await files('community-scripts/ct/lidarr.sh'),
    )) as AppRecord[]),
  ];
}

describe('source adapters (offline samples)', () => {
  it('LinuxServer.io: ports, volumes and architectures, without deprecated images', async () => {
    const records = (await linuxserverSource.normalize(
      JSON.parse(await text('linuxserver.json')),
    )) as AppRecord[];
    expect(records.map((r) => r.key)).toEqual(['lidarr', 'jellyfin', 'qemustatic']);
    expect(records[1]?.image?.ports[1]).toEqual({
      container: 7359,
      host: 7359,
      protocol: 'udp',
      description: 'Discovery',
      optional: true,
    });
    expect(records[0]?.image?.arch).toEqual(['amd64', 'arm64']);
  });

  it('awesome-selfhosted: only Docker-deployable entries', async () => {
    const records = (await awesomeSelfhostedSource.normalize(
      await files(
        'awesome-selfhosted/software/lidarr.yml',
        'awesome-selfhosted/software/no-docker.yml',
      ),
    )) as AppRecord[];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ key: 'lidarr', license: 'GPL-3.0', popularity: 4000 });
  });

  it('Community Scripts: LXC resources from ct scripts', async () => {
    const [record] = (await communityScriptsSource.normalize(
      await files('community-scripts/ct/lidarr.sh'),
    )) as AppRecord[];
    expect(record?.lxc).toEqual({ cpu: 2, ramMb: 1024, diskGb: 4 });
    expect(record?.categories).toEqual(['arr', 'torrent']);
  });

  it('Blender Open Data: CPU medians from Blender 3+, at least 5 results', async () => {
    expect(normalizeCpuName('Intel(R) Core(TM) i5-8500T CPU @ 2.10GHz')).toBe(
      'intel core i5-8500t',
    );
    expect(normalizeCpuName('12th Gen Intel Core i5-1240P')).toBe('intel core i5-1240p');
    expect(normalizeCpuName('AMD Ryzen 7 5700X 8-Core Processor')).toBe('amd ryzen 7 5700x');
    const records = await aggregate(linesOf('blender.jsonl'));
    expect(records.map((r) => r.normalized)).toEqual(['intel core i5-8500t', 'intel n100']);
    const scores = cpuScores(records, 'intel core i5-8500t');
    expect(scores.find((s) => s.normalized === 'intel n100')?.score).toBe(50);
  });
});

describe('merging', () => {
  it('builds deployable imported apps, enriched by the other sources; curated apps win', async () => {
    const { catalog } = await loadCurated();
    const { apps, curatedSources } = mergeApps({
      records: await sampleRecords(),
      curated: catalog.apps,
      aliases: {},
      heuristics,
    });
    expect(apps.map((a) => a.id)).toEqual(['lidarr']);
    const lidarr = apps[0];
    expect(lidarr).toMatchObject({
      name: 'Lidarr',
      license: 'GPL-3.0',
      website: 'https://lidarr.audio',
      confidence: 'imported',
      source: ['linuxserver', 'awesome-selfhosted', 'community-scripts'],
    });
    expect(lidarr?.requirements.recommended).toEqual({
      cpu: 2,
      memoryBytes: 768 * 1024 ** 2,
      diskBytes: 2e9,
    });
    expect(lidarr?.deployment.components[0]?.listeners[0]?.purpose).toBe('web-ui');
    expect(lidarr?.flows[0]?.id).toBe('lidarr.open-ui');
    expect(curatedSources.jellyfin).toEqual(['linuxserver']);
  });

  it('maps source words to catalog categories', () => {
    expect(categoriesFor(['Music', 'Downloaders'])).toEqual(['media', 'downloads']);
    expect(categoriesFor(['Web Browser'])).toEqual(['desktop']);
    expect(categoriesFor(['zzz'])).toEqual(['other']);
  });
});

describe('buildCatalog', () => {
  async function tempCatalog() {
    const dir = await mkdtemp(join(tmpdir(), 'catalog-'));
    await cp(CURATED_DIR, join(dir, 'curated'), { recursive: true });
    return dir;
  }
  const fake = (
    id: string,
    records: () => unknown[],
    fail = false,
  ): { adapter: SourceAdapter; budget: number } => ({
    budget: 1,
    adapter: {
      id,
      name: id,
      url: `https://${id}.example`,
      license: 'test',
      priority: 1,
      fetch: async () => {
        if (fail) throw new Error('network down');
        return null;
      },
      normalize: () => records() as never,
    },
  });
  const now = new Date('2026-11-16T03:00:00Z');

  it('writes dist with a manifest and state, then respects the weekly lock', async () => {
    const dir = await tempCatalog();
    const records = await sampleRecords();
    const sources = [
      fake('linuxserver', () => records.filter((r) => r.source === 'linuxserver')),
      fake('awesome-selfhosted', () => records.filter((r) => r.source === 'awesome-selfhosted')),
      fake('community-scripts', () => records.filter((r) => r.source === 'community-scripts')),
    ];
    expect(await buildCatalog({ catalogDir: dir, sources, now, log: () => {} })).toBe(0);
    const manifest = JSON.parse(
      await readFile(join(dir, 'dist/manifest.json'), 'utf8'),
    ) as Manifest;
    expect(manifest.catalogVersion).toBe('2026.47');
    expect(manifest.files[0]).toMatchObject({ name: 'apps.json', records: 1 });
    expect(manifest.sources.map((s) => s.status)).toEqual(['ok', 'ok', 'ok']);
    const lines: string[] = [];
    expect(await buildCatalog({ catalogDir: dir, sources, now, log: (l) => lines.push(l) })).toBe(
      0,
    );
    expect(lines[0]).toMatch(/skipped/);
  });

  it('keeps previous apps when a source fails and trips the safeguard on a big drop', async () => {
    const dir = await tempCatalog();
    await mkdir(join(dir, 'dist'), { recursive: true });
    const previous: Manifest = {
      format: 'server-planner/catalog',
      schemaVersion: 1,
      catalogVersion: '2026.46',
      generatedAt: '2026-11-09T03:00:00Z',
      minAppVersion: '1.1.0',
      files: [],
      sources: [
        {
          id: 'linuxserver',
          name: 'l',
          url: 'https://l',
          license: 't',
          status: 'ok',
          records: 100,
        },
      ],
    };
    await writeFile(join(dir, 'dist/manifest.json'), JSON.stringify(previous));
    await writeFile(join(dir, 'dist/apps.json'), JSON.stringify([{ id: 'kept' }]));

    const failing = [
      fake('linuxserver', () => [], true),
      fake('awesome-selfhosted', () => []),
      fake('community-scripts', () => []),
    ];
    expect(
      await buildCatalog({ catalogDir: dir, sources: failing, now, force: true, log: () => {} }),
    ).toBe(0);
    const manifest = JSON.parse(
      await readFile(join(dir, 'dist/manifest.json'), 'utf8'),
    ) as Manifest;
    expect(manifest.sources[0]).toMatchObject({
      status: 'failed',
      error: 'network down',
      records: 100,
    });
    expect(JSON.parse(await readFile(join(dir, 'dist/apps.json'), 'utf8'))).toEqual([
      { id: 'kept' },
    ]);

    const shrunk = [fake('linuxserver', () => Array.from({ length: 10 }, () => ({ kind: 'app' })))];
    const lines: string[] = [];
    expect(
      await buildCatalog({
        catalogDir: dir,
        sources: shrunk,
        now,
        force: true,
        log: (l) => lines.push(l),
      }),
    ).toBe(2);
    expect(lines.join('\n')).toMatch(/SAFEGUARD: linuxserver dropped from 100 to 10/);
  });
});
