import { describe, expect, it } from 'vitest';
import {
  addVlan,
  createId,
  deleteDevice,
  diffProjects,
  execute,
  type ModelContext,
  type Project,
  restoreSnapshot,
  updateDevice,
  updateInterface,
} from '../src';
import { buildHomeLab } from './support/home-lab';

const ctx: ModelContext = { createId, now: () => '2026-11-12T08:00:00.000Z' };
const run = <P>(p: Project, command: Parameters<typeof execute<P, unknown>>[1], payload: P) =>
  execute(p, command, payload, ctx).project;
const byName = (p: Project, name: string) => {
  const d = Object.values(p.devices).find((x) => x.name === name);
  if (!d) throw new Error(name);
  return d;
};

describe('snapshot diff and restore (PRJ-07)', () => {
  it('lists added, removed and changed elements with their names', () => {
    const before = buildHomeLab();
    let after = run(before, addVlan, { vlan: { vid: 40, name: 'Guest', color: 'lime' } });
    after = run(after, deleteDevice, { id: byName(after, 'tv-salon').id });
    after = run(after, updateDevice, {
      id: byName(after, 'pve1').id,
      changes: { hostname: 'pve' },
    });
    const nasPort = Object.values(after.interfaces).find(
      (i) => i.owner.id === byName(after, 'nas-01').id,
    );
    if (!nasPort) throw new Error('port');
    after = run(after, updateInterface, { id: nasPort.id, changes: { speedMbps: 2500 } });

    const diff = diffProjects(before, after);
    expect(diff).toContainEqual(
      expect.objectContaining({ collection: 'vlans', name: 'VLAN 40', change: 'added' }),
    );
    expect(diff).toContainEqual(
      expect.objectContaining({ collection: 'devices', name: 'tv-salon', change: 'removed' }),
    );
    expect(diff).toContainEqual({
      collection: 'devices',
      id: byName(after, 'pve1').id,
      name: 'pve1',
      change: 'changed',
      fields: ['hostname'],
    });
    expect(diff).toContainEqual(
      expect.objectContaining({ name: 'nas-01', fields: ['interfaces'] }),
    );
    expect(diffProjects(before, before)).toEqual([]);
  });

  it('restores a snapshot as one step, keeping id and name', () => {
    const before = buildHomeLab();
    const changed = run(before, deleteDevice, { id: byName(before, 'nas-01').id });
    const { id: _id, ...snapshotProject } = before;
    const restored = run({ ...changed, name: 'Renamed' }, restoreSnapshot, {
      snapshot: { project: snapshotProject },
    });
    expect(restored.id).toBe(changed.id);
    expect(restored.name).toBe('Renamed');
    expect(diffProjects(before, restored)).toEqual([]);
  });
});
