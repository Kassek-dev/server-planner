import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OS_IDS } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { isoWeekVersion, loadCurated, normalizeSizes, parseSize } from '../src/curated';

describe('units', () => {
  it('parses binary and decimal sizes', () => {
    expect(parseSize('8 GiB')).toBe(8 * 1024 ** 3);
    expect(parseSize('256 GB')).toBe(256e9);
    expect(parseSize('512 MiB')).toBe(512 * 1024 ** 2);
    expect(parseSize(1024)).toBe(1024);
    expect(parseSize('lots')).toBe('lots');
  });

  it('converts only *Bytes fields', () => {
    expect(
      normalizeSizes({ memoryBytes: '1 GiB', name: '1 GiB', list: [{ sizeBytes: '1 KB' }] }),
    ).toEqual({
      memoryBytes: 1024 ** 3,
      name: '1 GiB',
      list: [{ sizeBytes: 1000 }],
    });
  });

  it('versions the catalog by ISO week', () => {
    expect(isoWeekVersion(new Date('2026-11-12T10:00:00Z'))).toBe('2026.46');
    expect(isoWeekVersion(new Date('2027-01-01T10:00:00Z'))).toBe('2026.53');
  });
});

describe('curated layer (catalog/curated)', () => {
  it('validates without errors and covers every OS', async () => {
    const { catalog, errors } = await loadCurated();
    expect(errors).toEqual([]);
    expect(catalog.apps.length).toBeGreaterThanOrEqual(50);
    expect(catalog.os.map((o) => o.id).sort()).toEqual([...OS_IDS].sort());
  });

  it('resolves device CPU references with a catalog reference', async () => {
    const { catalog } = await loadCurated();
    const m720q = catalog.devices.find((d) => d.id === 'lenovo-m720q');
    expect(m720q?.hardware.cpus[0]).toMatchObject({
      model: 'Intel Core i5-8500T',
      threads: 6,
      catalogRef: { id: 'intel-core-i5-8500t', version: catalog.catalogVersion },
    });
    expect(m720q?.hardware.memory?.maxBytes).toBe(64 * 1024 ** 3);
  });

  it('every app listener has an inbound traffic pattern and every app a flow', async () => {
    const { catalog } = await loadCurated();
    for (const app of catalog.apps) {
      const main = app.deployment.components[0];
      for (const l of main?.listeners ?? []) {
        const covered = app.trafficPatterns.some(
          (p) => p.direction === 'inbound' && p.port === l.port && p.protocol === l.protocol,
        );
        expect(covered, `${app.id} ${l.protocol}/${l.port}`).toBe(true);
      }
      if (main?.listeners.length) expect(app.flows.length, app.id).toBeGreaterThan(0);
    }
  });
});

describe('errors', () => {
  it('reports bad YAML, schema problems, id mismatches and unknown CPU refs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'curated-'));
    for (const kind of ['apps', 'devices', 'cpus', 'os']) await mkdir(join(dir, kind));
    await writeFile(join(dir, 'apps', 'broken.yaml'), 'id: [unclosed');
    await writeFile(join(dir, 'os', 'debian.yaml'), 'id: debian\nname: Debian\n');
    await writeFile(
      join(dir, 'devices', 'other-name.yaml'),
      'id: box\nkind: mini-pc\nvendor: X\nmodel: Y\nformFactor: { mount: standalone, shape: mini-pc }\nhardware: { cpus: [{ ref: nope }], gpus: [] }\nports: [{ name: eth0, kind: rj45 }]\nsource: [curated]\nconfidence: curated\n',
    );
    const { errors } = await loadCurated(dir);
    const messages = errors.map((e) => `${e.file}: ${e.message}`).join('\n');
    expect(messages).toContain('apps/broken.yaml: YAML');
    expect(messages).toContain('os/debian.yaml: versions');
    expect(messages).toContain('unknown CPU reference');
    expect(messages).toContain('must match the file name');
  });
});
