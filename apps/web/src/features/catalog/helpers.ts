import {
  type CatalogApp,
  COMPUTE_KINDS,
  type HostRef,
  type PortMapping,
  type Project,
  publishedPorts,
  type StoragePool,
} from '@server-planner/model';
import { hostDevice } from '../simulation/store';

/** Where an app can be added (D-07 "Where"): compute devices, VMs and LXCs. */
export function appHosts(project: Project): { ref: HostRef; label: string }[] {
  const devices = Object.values(project.devices)
    .filter((d) => COMPUTE_KINDS.includes(d.kind))
    .map((d) => ({ ref: { type: 'device' as const, id: d.id }, label: d.name }));
  const guests = Object.values(project.workloads)
    .filter((w) => w.kind !== 'container')
    .map((w) => {
      const parent = hostDevice(project, { type: 'workload', id: w.id });
      const parentName = parent ? project.devices[parent]?.name : undefined;
      return {
        ref: { type: 'workload' as const, id: w.id },
        label: `${w.name} · ${w.kind.toUpperCase()}${parentName ? ` · ${parentName}` : ''}`,
      };
    });
  return [...devices, ...guests].sort((a, b) => a.label.localeCompare(b.label));
}

export const hostKey = (ref: HostRef) => `${ref.type}:${ref.id}`;
export function parseHostKey(key: string): HostRef | undefined {
  const [type, id] = key.split(':');
  return (type === 'device' || type === 'workload') && id ? { type, id } : undefined;
}

/** Host chosen by default: the given one, else the selected device / guest, else the first host. */
export function defaultHost(
  project: Project,
  preferred: HostRef | undefined,
  selection: { nodeIds: string[]; detail: { type: string; id: string } | null },
): HostRef | undefined {
  const hosts = appHosts(project);
  const has = (ref: HostRef | undefined) =>
    ref && hosts.some((h) => h.ref.type === ref.type && h.ref.id === ref.id) ? ref : undefined;
  const fromDetail =
    selection.detail?.type === 'workload'
      ? ({ type: 'workload', id: selection.detail.id } as const)
      : undefined;
  const fromNode = selection.nodeIds[0]
    ? ({ type: 'device', id: selection.nodeIds[0] } as const)
    : undefined;
  return has(preferred) ?? has(fromDetail) ?? has(fromNode) ?? hosts[0]?.ref;
}

/** Storage pools of the physical device under a host. */
export function hostPools(project: Project, host: HostRef): StoragePool[] {
  const device = hostDevice(project, host);
  return device ? (project.devices[device]?.hardware.pools ?? []) : [];
}

/** Ports already taken on the host (published by containers) plus extra ones being planned. */
export function takenPorts(project: Project, host: HostRef, planned: PortMapping[] = []) {
  return new Set(
    [...publishedPorts(project, host), ...planned].map((m) => `${m.protocol}/${m.hostPort}`),
  );
}

export function nextFreePort(taken: Set<string>, protocol: string, from: number): number {
  let port = from;
  while (taken.has(`${protocol}/${port}`) && port < 65535) port += 1;
  return port;
}

/** Published entry points of an app, e.g. ":2283" for the main component. */
export function appPorts(app: CatalogApp): string {
  const main = app.deployment.components[0];
  const ports = (main?.defaultPortMappings ?? []).map((m) => `:${m.hostPort}`);
  return [...new Set(ports)].slice(0, 3).join(' ');
}

export const installedApps = (project: Project) =>
  new Set(
    Object.values(project.apps)
      .map((a) => a.catalogRef?.id)
      .filter(Boolean),
  );
