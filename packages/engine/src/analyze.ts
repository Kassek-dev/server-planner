import type { Project } from '@server-planner/model';
import { capacity } from './capacity';
import { buildContext, type EngineContext, type EngineOptions } from './context';
import { internetAccess } from './simulation/access';
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
  const reports = capacity(ctx);

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
    deviceStatus,
    internet: internetAccess(ctx),
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
