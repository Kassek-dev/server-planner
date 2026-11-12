import {
  type CatalogLoadProfile,
  type Project,
  updateApp,
  updateDevice,
  updateWorkload,
} from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { analyze as analyzeWith, buildContext, capacity, expectedAppResources } from '../src';
import { apply, byName, homeLab } from './support';

const GiB = 1024 ** 3;
const profiles: Record<string, CatalogLoadProfile[]> = {
  jellyfin: [
    {
      id: 'idle',
      name: { en: 'Idle' },
      resources: { cpu: 0.1, memoryBytes: 0.5 * GiB, diskBytes: 0 },
    },
    {
      id: 'typical',
      name: { en: 'Typical' },
      params: [{ key: 'transcodes', name: { en: 'Transcodes' }, default: 1, min: 0, max: 8 }],
      resources: { cpu: 1.5, memoryBytes: 1 * GiB, diskBytes: 0 },
      perParam: { transcodes: { cpu: 1, memoryBytes: 0.25 * GiB } },
    },
  ],
};
const jellyfin = (p: Project) => Object.values(p.apps)[0];
function lab(): Project {
  const p = homeLab();
  const app = jellyfin(p);
  if (!app) throw new Error('no app');
  return apply(p, updateApp, {
    id: app.id,
    changes: { catalogRef: { id: 'jellyfin', version: '1' } },
  });
}

describe('expected usage (SW-08, CAP-05)', () => {
  it('uses the typical profile by default and scales with parameters', () => {
    let p = lab();
    const ctx = buildContext(p, { loadProfiles: profiles });
    const app = jellyfin(p);
    if (!app) throw new Error('no app');
    expect(expectedAppResources(ctx, app)).toMatchObject({ cpu: 1.5, memory: GiB });
    p = apply(p, updateApp, {
      id: app.id,
      changes: { loadProfile: { profileId: 'typical', params: { transcodes: 3 } } },
    });
    const next = jellyfin(p);
    if (!next) throw new Error('no app');
    expect(expectedAppResources(buildContext(p, { loadProfiles: profiles }), next)).toMatchObject({
      cpu: 3.5,
      memory: 1.5 * GiB,
    });
  });

  it('counts VMs by what runs inside, capped by their allocation, against real hardware', () => {
    const p = lab();
    const ctx = buildContext(p, { loadProfiles: profiles });
    const allocated = capacity(ctx);
    const expected = capacity(ctx, 'expected');
    const vm = byName(p, 'pve1');
    const docker = Object.values(p.workloads).find((w) => w.name === 'docker-vm');
    if (!docker) throw new Error('no vm');
    const vmEntry = (r: typeof expected) =>
      r[vm.id]?.cpu.breakdown.find((b) => b.ref.id === docker.id)?.amount;
    expect(vmEntry(allocated)).toBe(2);
    // Jellyfin typical (1.5) + no guest OS overhead in options → below the 2 vCPUs.
    expect(vmEntry(expected)).toBe(1.5);
    expect(expected[vm.id]?.mode).toBe('expected');
    // No overcommit in the expected mode.
    expect(expected[vm.id]?.cpu.capacity).toBeLessThanOrEqual(allocated[vm.id]?.cpu.capacity ?? 0);
  });
});

describe('storage forecast (SW-09, CAP-06)', () => {
  it('estimates months until a pool fills', () => {
    let p = lab();
    const container = Object.values(p.workloads).find((w) => w.kind === 'container');
    if (container?.kind !== 'container') throw new Error('no container');
    p = apply(p, updateWorkload, {
      id: container.id,
      changes: {
        volumes: container.volumes.map((v) => ({ ...v, growthBytesPerMonth: 10 * GiB })),
      },
    });
    const pve = byName(p, 'pve1');
    const pool = capacity(buildContext(p))[pve.id]?.storage[0];
    expect(pool?.growthPerMonth).toBe(10 * GiB);
    expect(pool?.monthsToFull).toBeCloseTo(
      ((pool?.capacity ?? 0) - (pool?.used ?? 0)) / (10 * GiB),
      5,
    );
  });
});

describe('GPU (HW-05)', () => {
  it('notes missing acceleration and hides the host GPU from a VM without passthrough', () => {
    let p = lab();
    const app = jellyfin(p);
    if (!app) throw new Error('no app');
    p = apply(p, updateApp, {
      id: app.id,
      changes: {
        requirements: {
          ...app.requirements,
          recommended: {
            ...app.requirements.recommended,
            gpu: { required: false, features: ['quicksync'] },
          },
        },
      },
    });
    const codes = (q: Project) =>
      analyzeWith(q)
        .issues.filter((i) => i.code.startsWith('VAL_GPU'))
        .map((i) => [i.code, i.params]);
    expect(codes(p)).toEqual([
      [
        'VAL_GPU_OPTIONAL',
        { app: 'Jellyfin', host: 'pve1', features: 'quicksync', behindVm: 'yes' },
      ],
    ]);
    const pve = byName(p, 'pve1');
    p = apply(p, updateDevice, {
      id: pve.id,
      changes: {
        hardware: {
          ...pve.hardware,
          gpus: [{ model: 'Intel UHD Graphics 630', features: ['quicksync'] }],
        },
      },
    });
    // The GPU exists but Jellyfin runs in a VM without passthrough.
    expect(codes(p)[0]?.[1]).toMatchObject({ behindVm: 'yes' });
    const vm = Object.values(p.workloads).find((w) => w.kind === 'vm');
    if (vm?.kind !== 'vm') throw new Error('no vm');
    p = apply(p, updateWorkload, { id: vm.id, changes: { passthrough: { gpu: true } } });
    expect(codes(p)).toEqual([]);
  });
});
