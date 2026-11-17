import {
  addDevice,
  type Project,
  updateDevice,
  updateInterface,
  updateProject,
} from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { buildContext, capacity, power } from '../src';
import { analyze, apply, byName, homeLab, ifaceOf } from './support';

function powered(): Project {
  let p = homeLab();
  const set = (name: string, idleW: number, loadW: number) => {
    const d = byName(p, name);
    p = apply(p, updateDevice, {
      id: d.id,
      changes: { hardware: { ...d.hardware, power: { idleW, loadW } } },
    });
  };
  set('gw-01', 8, 12);
  set('sw-core', 10, 15);
  set('pi-dns', 3, 6);
  set('nas-01', 20, 40);
  set('pve1', 10, 60);
  return p;
}
const report = (p: Project) => {
  const ctx = buildContext(p);
  return power(ctx, capacity(ctx));
};

describe('power (CAP-07)', () => {
  it('sums the expected draw and prices a month of energy', () => {
    let p = powered();
    p = apply(p, updateProject, {
      changes: { settings: { energyPrice: { perKwh: 0.3, currency: 'EUR' } } },
    });
    const r = report(p);
    expect(r.devices[byName(p, 'gw-01').id]).toMatchObject({ idleW: 8, source: 'spec' });
    // pve1 runs VMs: expected lies between idle and load.
    const pve = r.devices[byName(p, 'pve1').id];
    expect(pve?.expectedW).toBeGreaterThan(10);
    expect(pve?.expectedW).toBeLessThanOrEqual(60);
    // ap-living has no spec: its draw is estimated from its kind (D14); tv-salon is a client.
    expect(r.devices[byName(p, 'ap-living').id]).toMatchObject({ idleW: 5, source: 'estimate' });
    expect(r.totalIdleW).toBe(56);
    expect(r.unknown.map((id) => p.devices[id]?.name).sort()).toEqual(['tv-salon']);
    expect(r.monthlyKwh).toBeCloseTo((r.totalExpectedW * 730.5) / 1000, 5);
    expect(r.monthlyCost).toEqual({ amount: r.monthlyKwh * 0.3, currency: 'EUR' });
  });

  it('counts PoE devices through the switch port and flags an exceeded budget (VAL-12)', () => {
    let p = powered();
    const sw = byName(p, 'sw-core');
    const ap = byName(p, 'ap-living');
    const apPort = ifaceOf(p, 'ap-living', 'eth0');
    const link = Object.values(p.links).find((l) => l.a === apPort.id || l.b === apPort.id);
    const swPort = link && (link.a === apPort.id ? link.b : link.a);
    if (!swPort) throw new Error('ap not linked');
    p = apply(p, updateInterface, {
      id: swPort,
      changes: { poe: { role: 'pse', standard: 'at' } },
    });
    p = apply(p, updateDevice, {
      id: sw.id,
      changes: { switching: { layer: 2, managed: true, poeBudgetW: 20 } },
    });
    const r = report(p);
    expect(r.devices[ap.id]).toMatchObject({ source: 'poe', expectedW: 25.5 });
    expect(r.poe).toEqual([
      expect.objectContaining({ deviceId: sw.id, budgetW: 20, usedW: 25.5, status: 'over' }),
    ]);
    const issues = analyze(p).issues.filter((i) => i.code === 'VAL_12');
    expect(issues).toEqual([
      expect.objectContaining({
        severity: 'error',
        params: { device: 'sw-core', used: 25.5, budget: 20 },
      }),
    ]);
  });

  it('estimates UPS load and runtime for what it protects', () => {
    let p = powered();
    p = apply(p, addDevice, { kind: 'ups', name: 'ups-01' });
    const ups = byName(p, 'ups-01');
    p = apply(p, updateDevice, {
      id: ups.id,
      changes: { ups: { capacityVa: 600, capacityW: 360, batteryWh: 100 } },
    });
    const r = report(p);
    const u = r.ups[0];
    expect(u?.protected.length).toBe(7);
    // The UPS does not protect itself (its own draw is now estimated).
    const own = r.devices[ups.id]?.expectedW ?? 0;
    expect(u?.loadW).toBeCloseTo(r.totalExpectedW - own, 5);
    expect(u?.runtimeMin).toBeCloseTo(((100 * 0.8) / (u?.loadW ?? 1)) * 60, 5);
    expect(analyze(p).issues.some((i) => i.code === 'VAL_12_UPS')).toBe(false);

    p = apply(p, updateDevice, {
      id: ups.id,
      changes: { ups: { capacityVa: 100, capacityW: 60, batteryWh: 100 } },
    });
    expect(analyze(p).issues.find((i) => i.code === 'VAL_12_UPS')?.severity).toBe('error');
  });

  it('estimates a device without a spec from its parts (D14)', () => {
    let p = homeLab();
    const pve = byName(p, 'pve1');
    p = apply(p, updateDevice, {
      id: pve.id,
      changes: {
        hardware: {
          ...pve.hardware,
          power: undefined,
          cpus: [{ model: 'Intel Core i5-8500T', cores: 6, threads: 6, tdpW: 35, arch: 'amd64' }],
          memory: { type: 'DDR4', modules: [{ sizeBytes: 16 * 1024 ** 3, count: 2 }] },
          disks: [{ id: 'dsk_a', name: 'nvme0', type: 'ssd-nvme', sizeBytes: 1e12 }],
        },
      },
    });
    const d = report(p).devices[pve.id];
    expect(d?.source).toBe('estimate');
    // platform 3/6 + CPU 4.2/35 + 2 × DDR4 2/6 + NVMe 1.5/6
    expect(d).toMatchObject({ idleW: 10.7, loadW: 53 });
    expect(d?.parts?.map((x) => x.kind)).toEqual(['platform', 'cpu', 'memory', 'disk']);
  });

  it('adds parts beyond the catalog model to its spec', () => {
    let p = homeLab();
    const nas = byName(p, 'nas-01');
    p = apply(p, updateDevice, {
      id: nas.id,
      changes: {
        catalogRef: { id: 'test-nas', version: '2026.47' },
        hardware: {
          ...nas.hardware,
          power: { idleW: 15, loadW: 30 },
          disks: [
            { id: 'dsk_1', name: 'd1', type: 'hdd', sizeBytes: 8e12 },
            { id: 'dsk_2', name: 'd2', type: 'hdd', sizeBytes: 8e12 },
          ],
        },
      },
    });
    const ctx = buildContext(p, {
      modelBaselines: { 'test-nas': { power: { idleW: 15, loadW: 30 }, disks: [], gpus: 0 } },
    });
    const d = power(ctx, capacity(ctx)).devices[nas.id];
    expect(d).toMatchObject({ source: 'spec+parts', idleW: 25, loadW: 46 });
    // A spec entered by hand is the whole figure.
    const manual = power(buildContext(p), capacity(buildContext(p))).devices[nas.id];
    expect(manual).toMatchObject({ source: 'spec', idleW: 15 });
  });
});
