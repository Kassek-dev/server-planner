import type { Endpoint, Project } from '@server-planner/model';

/**
 * Endpoints of assertions (SIM-06) as select values: `internet`, `any`, or `<type>:<id>` for zones,
 * subnets, devices, workloads and apps.
 */

export function endpointValue(e: Endpoint): string {
  switch (e.type) {
    case 'any':
    case 'internet':
      return e.type;
    case 'cidr':
      return `cidr:${e.value}`;
    default:
      return `${e.type}:${e.id}`;
  }
}

export function endpointFromValue(project: Project, value: string): Endpoint | undefined {
  if (value === 'any' || value === 'internet') return { type: value };
  const [type = '', ...rest] = value.split(':');
  const id = rest.join(':');
  if (!id) return undefined;
  switch (type) {
    case 'zone':
      return project.zones[id] ? { type, id } : undefined;
    case 'subnet':
      return project.subnets[id] ? { type, id } : undefined;
    case 'device':
      return project.devices[id] ? { type, id } : undefined;
    case 'workload':
      return project.workloads[id] ? { type, id } : undefined;
    case 'app':
      return project.apps[id] ? { type, id } : undefined;
    default:
      return undefined;
  }
}

export interface EndpointGroup {
  key: 'zones' | 'subnets' | 'devices' | 'workloads' | 'apps';
  options: { value: string; label: string }[];
}

/** Picker groups: zones → subnets → devices → workloads → apps, each sorted by name. */
export function endpointGroups(project: Project): EndpointGroup[] {
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
  return [
    {
      key: 'zones' as const,
      options: Object.values(project.zones)
        .filter((z) => z.kind !== 'wan')
        .map((z) => ({ value: `zone:${z.id}`, label: z.name })),
    },
    {
      key: 'subnets' as const,
      options: Object.values(project.subnets).map((s) => ({
        value: `subnet:${s.id}`,
        label: s.cidr,
      })),
    },
    {
      key: 'devices' as const,
      options: Object.values(project.devices)
        .filter((d) => d.kind !== 'internet')
        .map((d) => ({ value: `device:${d.id}`, label: d.name })),
    },
    {
      key: 'workloads' as const,
      options: Object.values(project.workloads).map((w) => ({
        value: `workload:${w.id}`,
        label: w.name,
      })),
    },
    {
      key: 'apps' as const,
      options: Object.values(project.apps).map((a) => ({ value: `app:${a.id}`, label: a.name })),
    },
  ]
    .map((g) => ({ ...g, options: g.options.sort(byLabel) }))
    .filter((g) => g.options.length > 0);
}

/** A simulation endpoint (device, workload, app or the internet) as an assertion endpoint. */
export function endpointOf(target: { type: string; id: string } | 'internet'): Endpoint {
  if (target === 'internet') return { type: 'internet' };
  const { type, id } = target;
  return type === 'workload' || type === 'app' ? { type, id } : { type: 'device', id };
}
