import type { EntityRef } from '@server-planner/engine';
import type { Project } from '@server-planner/model';

/** Endpoints a simulation can start from or target (SIM-01): devices, workloads and apps. */

export type Target = EntityRef | 'internet';

export function refFor(project: Project, id: string | null | undefined): EntityRef | undefined {
  if (!id) return undefined;
  if (project.devices[id]) return { type: 'device', id };
  if (project.workloads[id]) return { type: 'workload', id };
  if (project.apps[id]) return { type: 'app', id };
  return undefined;
}

export function targetFor(project: Project, id: string | null | undefined): Target | undefined {
  return id === 'internet' ? 'internet' : refFor(project, id);
}

export function endpointName(project: Project, ref: Target): string {
  if (ref === 'internet') return 'Internet';
  switch (ref.type) {
    case 'device':
      return project.devices[ref.id]?.name ?? '?';
    case 'workload':
      return project.workloads[ref.id]?.name ?? '?';
    case 'app':
      return project.apps[ref.id]?.name ?? '?';
    default:
      return '?';
  }
}

/** Options for endpoint pickers, grouped devices → workloads → apps (labels name the kind). */
export function endpointOptions(
  project: Project,
  kindLabel: (kind: string) => string,
): { value: string; label: string }[] {
  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
  return [
    ...Object.values(project.devices)
      .filter((d) => d.kind !== 'internet')
      .sort(byName)
      .map((d) => ({ value: d.id, label: `${d.name} · ${kindLabel(d.kind)}` })),
    ...Object.values(project.workloads)
      .sort(byName)
      .map((w) => ({ value: w.id, label: `${w.name} · ${kindLabel(w.kind)}` })),
    ...Object.values(project.apps)
      .sort(byName)
      .map((a) => ({ value: a.id, label: `${a.name} · ${kindLabel('app')}` })),
  ];
}
