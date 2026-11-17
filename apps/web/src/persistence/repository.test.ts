import { createProject, sequentialContext } from '@server-planner/model';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import v1 from '../../../../fixtures/schema/v1/home-lab.json';
import { DB_VERSION, openAppDb } from './db';
import { ProjectRepository, toMeta } from './repository';

let n = 0;
const freshRepo = async () =>
  new ProjectRepository(await openAppDb(`test-repo-${++n}`), sequentialContext());

describe('ProjectRepository', () => {
  it('saves, lists newest first, loads and deletes projects', async () => {
    const repo = await freshRepo();
    const a = { ...createProject('A'), updatedAt: '2026-11-10T10:00:00.000Z' };
    const b = { ...createProject('B'), updatedAt: '2026-11-11T10:00:00.000Z' };
    await repo.save(a);
    await repo.save(b);
    expect((await repo.list()).map((p) => p.name)).toEqual(['B', 'A']);
    expect(await repo.get(a.id)).toEqual(a);
    await repo.delete(a.id);
    expect(await repo.get(a.id)).toBeUndefined();
    expect((await repo.list()).map((p) => p.name)).toEqual(['B']);
  });

  it('keeps snapshots per project and removes them with the project (PRJ-07)', async () => {
    const repo = await freshRepo();
    const a = createProject('A');
    const b = createProject('B');
    await repo.save(a);
    await repo.save(b);
    const first = await repo.createSnapshot(a, 'before');
    await repo.createSnapshot(b, 'other');
    expect((await repo.listSnapshots(a.id)).map((s) => s.name)).toEqual(['before']);
    expect(first.project).not.toHaveProperty('id');
    await repo.delete(a.id);
    expect(await repo.listSnapshots(a.id)).toEqual([]);
    expect(await repo.listSnapshots(b.id)).toHaveLength(1);
    await repo.deleteSnapshot((await repo.listSnapshots(b.id))[0]?.id ?? '');
    expect(await repo.listSnapshots(b.id)).toEqual([]);
  });

  it('duplicates with a new project id and renames', async () => {
    const repo = await freshRepo();
    const original = createProject('Lab');
    await repo.save(original);
    const copy = await repo.duplicate(original.id, 'Lab (copy)');
    expect(copy.id).not.toBe(original.id);
    await repo.rename(copy.id, 'Lab 2');
    expect((await repo.list()).map((p) => p.name).sort()).toEqual(['Lab', 'Lab 2']);
  });

  it('tracks changes since the last export', async () => {
    const repo = await freshRepo();
    await repo.recordChangeSaved();
    await repo.recordChangeSaved();
    expect((await repo.getBackupState()).changesSinceExport).toBe(2);
    await repo.recordExport('2026-11-11T12:00:00.000Z');
    expect(await repo.getBackupState()).toEqual({
      lastExportAt: '2026-11-11T12:00:00.000Z',
      changesSinceExport: 0,
    });
  });

  it('meta does not count the Internet node as a device', () => {
    const project = createProject('Lab');
    project.devices.dev_x = {
      id: 'dev_x',
      kind: 'internet',
      name: 'Internet',
      tagIds: [],
      hardware: { cpus: [], disks: [], pools: [], gpus: [] },
    };
    expect(toMeta(project).deviceCount).toBe(0);
  });

  it('migrates projects and snapshots stored by version 1.1 (database v2) to schema v2', async () => {
    const name = `test-repo-upgrade-${++n}`;
    const old = await openDB(name, 2, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' }).createIndex('by-updated', 'updatedAt');
        db.createObjectStore('projectData', { keyPath: 'id' });
        db.createObjectStore('settings');
        db.createObjectStore('snapshots', { keyPath: 'id' }).createIndex('by-project', 'projectId');
      },
    });
    const { id, ...content } = v1.project;
    await old.put('projectData', v1.project);
    await old.put('snapshots', {
      id: 'snap_0001',
      projectId: id,
      name: 'before',
      createdAt: v1.exportedAt,
      project: content,
    });
    old.close();

    const repo = new ProjectRepository(await openAppDb(name), sequentialContext());
    const project = await repo.get(id);
    expect(project?.proxyRoutes).toEqual({});
    expect(project?.dnsRecords).toEqual({});
    expect(project?.devices).toEqual(v1.project.devices);
    const [snapshot] = await repo.listSnapshots(id);
    expect(snapshot?.project.dnsRecords).toEqual({});
    expect(project?.flowScenarios).toEqual({});
    expect(snapshot?.project.flowScenarios).toEqual({});
  });

  it('adds flow scenarios to projects stored by versions 1.2–1.7 (database v3, schema v4)', async () => {
    const name = `test-repo-upgrade-${++n}`;
    const old = await openDB(name, 3, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' }).createIndex('by-updated', 'updatedAt');
        db.createObjectStore('projectData', { keyPath: 'id' });
        db.createObjectStore('settings');
        db.createObjectStore('snapshots', { keyPath: 'id' }).createIndex('by-project', 'projectId');
      },
    });
    const { flowScenarios: _, ...stored } = createProject('Lab');
    await old.put('projectData', stored);
    old.close();
    const repo = new ProjectRepository(await openAppDb(name), sequentialContext());
    expect((await repo.get(stored.id))?.flowScenarios).toEqual({});
  });

  it('an open older tab lets a newer version upgrade the database', async () => {
    const name = `test-repo-blocking-${++n}`;
    let released = 0;
    await openAppDb(name, () => {
      released += 1;
    });
    // A newer app version opens the same database with a higher version.
    const newer = await openDB(name, DB_VERSION + 1);
    expect(released).toBe(1);
    newer.close();
  });

  it('creates a variant linked to its base, kept across saves (PRJ-10)', async () => {
    const repo = await freshRepo();
    const base = createProject('Lab');
    await repo.save(base);
    const variant = await repo.createVariant(base.id, 'Lab — 32 GB');
    expect((await repo.getMeta(variant.id))?.variantOf).toBe(base.id);
    await repo.save({ ...variant, name: 'Lab — 64 GB' });
    expect(await repo.getMeta(variant.id)).toMatchObject({
      name: 'Lab — 64 GB',
      variantOf: base.id,
    });
    const second = await repo.createVariant(variant.id, 'Lab — again');
    expect((await repo.getMeta(second.id))?.variantOf).toBe(base.id);
    expect((await repo.getMeta(base.id))?.variantOf).toBeUndefined();
  });
});
