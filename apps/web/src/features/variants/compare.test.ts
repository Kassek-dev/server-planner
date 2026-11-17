import { addDevice, execute, type Project } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { deviceByName, homeLab } from '../canvas/testSupport';
import { compareProjects, upgrades } from './compare';

const GiB = 1024 ** 3;

/** The home lab with 32 GiB more RAM and a new SSD in pve1, and a second mini PC. */
function upgraded(base: Project): Project {
  const pve = deviceByName(base, 'pve1');
  let p: Project = {
    ...base,
    devices: {
      ...base.devices,
      [pve.id]: {
        ...pve,
        hardware: {
          ...pve.hardware,
          memory: {
            ...pve.hardware.memory,
            modules: [...(pve.hardware.memory?.modules ?? []), { sizeBytes: 32 * GiB, count: 1, purchase: { status: 'to-buy', price: 80 } }],
          },
          disks: [
            ...pve.hardware.disks,
            {
              id: 'dsk_new',
              name: 'nvme1',
              type: 'ssd-nvme',
              sizeBytes: 2e12,
              purchase: { status: 'to-buy', price: 120 },
            },
          ],
        },
      },
    },
  };
  p = execute(p, addDevice, { kind: 'mini-pc', name: 'pve2' }).project;
  return p;
}

describe('variant comparison (PRJ-10)', () => {
  it('lists the parts to buy: new devices, more memory and new disks', () => {
    const base = homeLab();
    const variant = upgraded(base);
    const list = upgrades(base, variant);
    const pve = deviceByName(base, 'pve1');
    const before = (pve.hardware.memory?.modules ?? []).reduce(
      (s, m) => s + m.sizeBytes * m.count,
      0,
    );
    expect(list).toContainEqual(expect.objectContaining({ kind: 'device', name: 'pve2' }));
    expect(list).toContainEqual({
      kind: 'memory',
      deviceId: pve.id,
      name: 'pve1',
      before,
      after: before + 32 * GiB,
      price: 80,
    });
    expect(list).toContainEqual({
      kind: 'disks',
      deviceId: pve.id,
      name: 'pve1',
      disks: [{ type: 'ssd-nvme', sizeBytes: 2e12 }],
      price: 120,
    });
    // Parts marked to buy also count in the bill of materials (1.9).
    const c = compareProjects(base, variant, null, null);
    expect(c.variant.bom.toBuyCost).toEqual([{ currency: 'EUR', amount: 200 }]);
    expect(upgrades(base, base)).toEqual([]);
  });

  it('compares the diff and the totals of both sides', () => {
    const base = homeLab();
    const variant = upgraded(base);
    const c = compareProjects(base, variant, null, null);
    expect(c.diff.some((d) => d.change === 'added' && d.name === 'pve2')).toBe(true);
    expect(c.diff.some((d) => d.change === 'changed' && d.name === 'pve1')).toBe(true);
    expect(c.variant.bom.owned).toBe(c.base.bom.owned + 1);
  });
});
