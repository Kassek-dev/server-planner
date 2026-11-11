import { clone } from './clone';
import {
  DEFAULT_FORM_FACTOR,
  DEFAULT_PORTS,
  DEFAULT_PROJECT_SETTINGS,
  emptyLayout,
} from './defaults';
import type { EntityType } from './ids';
import { createId, ID_PREFIXES } from './ids';
import type { IsoDate } from './schema/common';
import type { Device, DeviceKind } from './schema/device';
import type { Interface } from './schema/network';
import type { Project } from './schema/project';

/** Source of IDs and time for factories and commands — injectable for deterministic tests. */
export interface ModelContext {
  createId: <T extends EntityType>(type: T) => `${(typeof ID_PREFIXES)[T]}_${string}`;
  now: () => IsoDate;
}

export const defaultContext: ModelContext = {
  createId,
  now: () => new Date().toISOString(),
};

/** Deterministic context for tests and fixtures: `dev_0001`, `if_0002`, … and a fixed clock. */
export function sequentialContext(now = '2026-11-11T12:00:00.000Z'): ModelContext {
  let counter = 0;
  function nextId<T extends EntityType>(type: T): `${(typeof ID_PREFIXES)[T]}_${string}` {
    counter += 1;
    return `${ID_PREFIXES[type]}_${String(counter).padStart(4, '0')}`;
  }
  return { createId: nextId, now: () => now };
}

export function createProject(name: string, ctx: ModelContext = defaultContext): Project {
  const now = ctx.now();
  return {
    id: ctx.createId('project'),
    name,
    createdAt: now,
    updatedAt: now,
    catalogVersion: 'builtin',
    settings: clone(DEFAULT_PROJECT_SETTINGS),
    devices: {},
    interfaces: {},
    links: {},
    workloads: {},
    stacks: {},
    dockerNetworks: {},
    apps: {},
    vlans: {},
    subnets: {},
    zones: {},
    routes: {},
    tags: {},
    assertions: {},
    locations: {},
    layout: emptyLayout(),
  };
}

/** Next free default name: `switch-1`, `switch-2`, … (docs/05 § 4.2). */
export function nextDeviceName(project: Project, kind: DeviceKind): string {
  if (kind === 'internet') return 'Internet';
  const taken = new Set(Object.values(project.devices).map((d) => d.name));
  let n = 1;
  while (taken.has(`${kind}-${n}`)) n += 1;
  return `${kind}-${n}`;
}

/** A generic device of the given kind with default form factor, sections and ports (LIB-01). */
export function createDevice(
  project: Project,
  kind: DeviceKind,
  ctx: ModelContext = defaultContext,
  name = nextDeviceName(project, kind),
): { device: Device; interfaces: Interface[] } {
  const id = ctx.createId('device');
  const formFactor = DEFAULT_FORM_FACTOR[kind];
  const device: Device = {
    id,
    kind,
    name,
    tagIds: [],
    hardware: { cpus: [], disks: [], pools: [], gpus: [] },
    ...(formFactor ? { formFactor: clone(formFactor) } : {}),
    ...(kind === 'switch' ? { switching: { layer: 2 as const, managed: true } } : {}),
    ...(kind === 'router' || kind === 'firewall'
      ? {
          switching: { layer: 3 as const, managed: true },
          firewall: { defaultAction: 'deny' as const, rules: [], nat: [], stateful: true as const },
        }
      : {}),
    ...(kind === 'access-point' ? { wifi: { ssids: [] } } : {}),
    ...(kind === 'client' ? { clientType: 'other' as const } : {}),
  };
  const interfaces = DEFAULT_PORTS[kind].map(
    (port, index): Interface => ({
      id: ctx.createId('interface'),
      owner: { type: 'device', id },
      name: port.name,
      kind: port.kind,
      index,
      ...(port.speedMbps ? { speedMbps: port.speedMbps } : {}),
      ...(port.poe ? { poe: { ...port.poe } } : {}),
      addresses: [],
      enabled: true,
    }),
  );
  return { device, interfaces };
}
