import {
  addDevice,
  execute,
  type Project,
  setDeviceOs,
  updateDevice,
  updateWorkload,
} from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { placementPlan } from '../src';
import { analyze, byName, homeLab } from './support';

/** CAP-10 placement suggestions and upgrade recommendations. */

const GiB = 1024 ** 3;

/** pve1 with docker-vm grown to 28 GiB: its 32 GiB are over the critical threshold. */
function overloaded(): Project {
  let p = homeLab();
  const vm = Object.values(p.workloads).find((w) => w.name === 'docker-vm');
  if (!vm || vm.kind === 'container') throw new Error('no docker-vm');
  p = execute(p, updateWorkload, {
    id: vm.id,
    changes: { resources: { ...vm.resources, memoryBytes: 28 * GiB } },
  }).project;
  return p;
}

/** A second Proxmox host with 64 GiB. */
function withSecondHost(base: Project): Project {
  const added = execute(base, addDevice, { kind: 'mini-pc', name: 'pve2' });
  let p = added.project;
  const pve2 = p.devices[added.result.deviceId];
  if (!pve2) throw new Error('no pve2');
  p = execute(p, updateDevice, {
    id: pve2.id,
    changes: {
      hardware: {
        ...pve2.hardware,
        cpus: [{ model: 'Intel Core i5-12500T', cores: 6, threads: 12, arch: 'amd64' }],
        memory: { modules: [{ sizeBytes: 32 * GiB, count: 2 }], slotsTotal: 2, maxBytes: 64 * GiB },
      },
    },
  }).project;
  return execute(p, setDeviceOs, { id: pve2.id, os: { osId: 'proxmox-ve', version: '8.3' } })
    .project;
}

describe('placement suggestions (CAP-10)', () => {
  it('a balanced lab needs nothing', () => {
    const p = homeLab();
    expect(placementPlan(p, analyze(p).capacity)).toEqual({ moves: [], upgrades: [] });
  });

  it('moves a workload from an overloaded Proxmox host to one with room', () => {
    const p = withSecondHost(overloaded());
    const plan = placementPlan(p, analyze(p).capacity);
    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0]).toMatchObject({
      from: byName(p, 'pve1').id,
      to: byName(p, 'pve2').id,
    });
    expect(plan.upgrades).toEqual([]);
  });

  it('recommends more memory when no host has room', () => {
    const p = overloaded();
    const plan = placementPlan(p, analyze(p).capacity);
    expect(plan.moves).toEqual([]);
    const upgrade = plan.upgrades.find((u) => u.kind === 'memory');
    expect(upgrade).toMatchObject({ deviceId: byName(p, 'pve1').id });
    expect(upgrade?.kind === 'memory' && upgrade.addBytes % (8 * GiB)).toBe(0);
  });
});
