import type { Id, Project } from '@server-planner/model';

/**
 * NET-16 mDNS (Bonjour, Chromecast, AirPlay, printers…) stays inside its VLAN unless a router
 * reflects it. Discovery domains are the VLANs that see each other's services — joined by every
 * reflector that lists them. No multicast is simulated; this is about who can discover whom.
 */
export interface MdnsDomain {
  vlanIds: Id[];
  /** Routers that reflect between these VLANs (empty for a VLAN on its own). */
  reflectors: Id[];
}

export function mdnsDomains(project: Project): MdnsDomain[] {
  const parent = new Map<Id, Id>();
  const find = (v: Id): Id => {
    let root = v;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    parent.set(v, root);
    return root;
  };
  for (const v of Object.keys(project.vlans)) parent.set(v, v);
  const reflectorOf = new Map<Id, Set<Id>>();
  for (const device of Object.values(project.devices)) {
    const vlans = (device.mdnsReflector?.vlanIds ?? []).filter((v) => project.vlans[v]);
    if (vlans.length < 2) continue;
    const [first, ...rest] = vlans as [Id, ...Id[]];
    for (const v of rest) parent.set(find(v), find(first));
    for (const v of vlans) reflectorOf.set(v, (reflectorOf.get(v) ?? new Set()).add(device.id));
  }
  const groups = new Map<Id, Id[]>();
  for (const v of Object.keys(project.vlans)) {
    const root = find(v);
    groups.set(root, [...(groups.get(root) ?? []), v]);
  }
  const vid = (id: Id) => project.vlans[id]?.vid ?? 0;
  return [...groups.values()]
    .map((vlanIds) => ({
      vlanIds: vlanIds.sort((a, b) => vid(a) - vid(b)),
      reflectors:
        vlanIds.length > 1
          ? [...new Set(vlanIds.flatMap((v) => [...(reflectorOf.get(v) ?? [])]))].sort()
          : [],
    }))
    .sort((a, b) => vid(a.vlanIds[0] ?? '') - vid(b.vlanIds[0] ?? ''));
}

/** Whether a service announced in `from` is discoverable in `to`. */
export function mdnsVisible(domains: MdnsDomain[], from: Id, to: Id): boolean {
  return from === to || domains.some((d) => d.vlanIds.includes(from) && d.vlanIds.includes(to));
}
