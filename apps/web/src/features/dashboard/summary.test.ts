import { analyze } from '@server-planner/engine';
import { execute, type Project, sequentialContext, updateDevice } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { deviceByName, homeLab as lab } from '../canvas/testSupport';
import { bomTotals, hostReports, resourceTotals } from './summary';

const purchase = (p: Project, name: string, value: Project['devices'][string]['purchase']) =>
  execute(
    p,
    updateDevice,
    { id: deviceByName(p, name).id, changes: { purchase: value } },
    sequentialContext(),
  ).project;

describe('dashboard summary (CAP-09)', () => {
  it('totals the resources of physical hosts', () => {
    const p = lab();
    const reports = hostReports(p, analyze(p));
    expect(reports.length).toBeGreaterThan(0);
    const totals = resourceTotals(reports);
    expect(totals.hosts).toBe(reports.length);
    expect(totals.cores).toBe(reports.reduce((s, r) => s + r.cpu.capacity, 0));
    expect(totals.cpuRatio).toBeGreaterThan(0);
  });

  it('sums what is left to buy per currency', () => {
    let p = lab();
    p = purchase(p, 'nas-01', { status: 'to-buy', price: 400, currency: 'EUR' });
    p = purchase(p, 'pi-dns', { status: 'optional' });
    expect(bomTotals(p)).toMatchObject({
      toBuy: 1,
      optional: 1,
      toBuyCost: [{ currency: 'EUR', amount: 400 }],
      unpriced: 1,
    });
  });
});
