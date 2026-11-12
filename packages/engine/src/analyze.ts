import type { Project } from '@server-planner/model';
import { capacity } from './capacity';
import { buildContext, type EngineContext, type EngineOptions } from './context';
import { power } from './power';
import { internetAccess } from './simulation/access';
import { evaluateAssertions } from './simulation/assertions';
import type { AnalysisResult, DeviceStatus, EntityRef, Issue } from './types';
import { rules } from './validation/rules';

const RANK: Record<DeviceStatus, number> = { ok: 0, warning: 1, error: 2 };

/** Device a reference belongs to (device itself, owner of an interface, host of a workload or app). */
function deviceOf(ctx: EngineContext, ref: EntityRef): string | undefined {
  const p = ctx.project;
  switch (ref.type) {
    case 'device':
      return ref.id;
    case 'interface':
      return ctx.deviceOfInterface.get(ref.id)?.id;
    case 'workload':
      return ctx.deviceOfWorkload.get(ref.id)?.id;
    case 'app': {
      const app = p.apps[ref.id];
      if (!app) return undefined;
      return app.runsOn.type === 'device'
        ? app.runsOn.id
        : ctx.deviceOfWorkload.get(app.runsOn.id)?.id;
    }
    default:
      return undefined;
  }
}

/**
 * Full analysis of a project (docs/03 § 5.1): context → validation rules + capacity + internet
 * access → device status.
 * Pure and synchronous; runs in the engine worker.
 */
export function analyze(project: Project, options: EngineOptions = {}): AnalysisResult {
  const started = Date.now();
  const ctx = buildContext(project, options);
  const issues: Issue[] = rules.flatMap((rule) => rule.run(ctx));
  // SIM-06: an assertion that does not hold is an issue (security breach = error).
  const assertions = evaluateAssertions(ctx);
  for (const r of assertions) {
    const a = project.assertions[r.assertionId];
    if (!a || r.passed !== false) continue;
    issues.push({
      code: 'VAL_ASSERT',
      severity: a.expect === 'blocked' ? 'error' : 'warning',
      params: { name: a.name ?? r.assertionId, expect: a.expect, actual: r.actual },
      targets: [{ type: 'assertion', id: a.id }],
    });
  }
  const reports = capacity(ctx);
  // VAL-12 (PoE budget) and an overloaded UPS come from the power estimate (CAP-07/08).
  const expected = capacity(ctx, 'expected');
  const energy = power(ctx, expected);
  for (const b of energy.poe)
    if (b.budgetW > 0 && b.usedW > b.budgetW)
      issues.push({
        code: 'VAL_12',
        severity: 'error',
        params: {
          device: project.devices[b.deviceId]?.name ?? '?',
          used: Math.round(b.usedW * 10) / 10,
          budget: b.budgetW,
        },
        targets: [{ type: 'device', id: b.deviceId }],
      });
  for (const u of energy.ups)
    if (u.capacityW > 0 && u.loadW > u.capacityW)
      issues.push({
        code: 'VAL_12_UPS',
        severity: 'error',
        params: {
          device: project.devices[u.deviceId]?.name ?? '?',
          load: Math.round(u.loadW),
          capacity: u.capacityW,
        },
        targets: [{ type: 'device', id: u.deviceId }],
      });

  const deviceStatus: Record<string, DeviceStatus> = {};
  for (const id of Object.keys(project.devices)) deviceStatus[id] = 'ok';
  const raise = (id: string | undefined, status: DeviceStatus) => {
    if (id && RANK[status] > RANK[deviceStatus[id] ?? 'ok']) deviceStatus[id] = status;
  };
  for (const issue of issues) {
    if (issue.severity === 'info') continue;
    const status: DeviceStatus = issue.severity === 'error' ? 'error' : 'warning';
    for (const target of issue.targets) raise(deviceOf(ctx, target), status);
  }
  return {
    issues,
    capacity: reports,
    expected,
    deviceStatus,
    internet: internetAccess(ctx),
    assertions,
    power: energy,
    durationMs: Date.now() - started,
  };
}

/** True when only the canvas layout changed — analyses can be skipped (docs/03 § 5.5). */
export function sameDomain(a: Project, b: Project): boolean {
  const keys: (keyof Project)[] = [
    'devices',
    'interfaces',
    'links',
    'workloads',
    'stacks',
    'dockerNetworks',
    'apps',
    'vlans',
    'subnets',
    'zones',
    'routes',
    'tags',
    'assertions',
    'locations',
    'settings',
  ];
  return keys.every((k) => a[k] === b[k]);
}
