import { createProject, sequentialContext } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { openAppDb } from './db';
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
});
