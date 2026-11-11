import { SINGLE_LINK_KINDS } from './defaults';
import type { Interface, InterfaceKind } from './schema/network';
import type { Project } from './schema/project';

/**
 * Port auto-pick when a cable is dropped on a whole tile (docs/05 § 4.4 step 3):
 * the first free, compatible pair of physical ports, by port order.
 */

type Family = 'copper' | 'fiber' | 'wifi';

const FAMILY: Partial<Record<InterfaceKind, Family>> = {
  rj45: 'copper',
  wan: 'copper',
  sfp: 'fiber',
  'sfp+': 'fiber',
  sfp28: 'fiber',
  'qsfp+': 'fiber',
  'wifi-radio': 'wifi',
};

export function isInterfaceFree(project: Project, iface: Interface): boolean {
  if (!SINGLE_LINK_KINDS.includes(iface.kind)) return true;
  return !Object.values(project.links).some((l) => l.a === iface.id || l.b === iface.id);
}

function physicalPorts(project: Project, deviceId: string, family: Family): Interface[] {
  return Object.values(project.interfaces)
    .filter(
      (i) => i.owner.type === 'device' && i.owner.id === deviceId && FAMILY[i.kind] === family,
    )
    .filter((i) => i.enabled && isInterfaceFree(project, i))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

/** Prefers WAN ports towards the Internet node and Wi-Fi between an access point and a client. */
export function findConnectablePorts(
  project: Project,
  deviceA: string,
  deviceB: string,
): { a: string; b: string } | undefined {
  if (deviceA === deviceB) return undefined;
  const a = project.devices[deviceA];
  const b = project.devices[deviceB];
  if (!a || !b) return undefined;

  const kinds = new Set([a.kind, b.kind]);
  const families: Family[] =
    kinds.has('access-point') && kinds.has('client')
      ? ['wifi', 'copper', 'fiber']
      : ['copper', 'fiber', 'wifi'];
  const wanFirst = (ports: Interface[], other: string) =>
    project.devices[other]?.kind === 'internet'
      ? [...ports].sort((x, y) => Number(y.kind === 'wan') - Number(x.kind === 'wan'))
      : ports;

  for (const family of families) {
    const pa = wanFirst(physicalPorts(project, deviceA, family), deviceB);
    const pb = wanFirst(physicalPorts(project, deviceB, family), deviceA);
    const first = pa[0];
    const second = pb[0];
    if (first && second) return { a: first.id, b: second.id };
  }
  return undefined;
}
