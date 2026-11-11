import type { Device, HostRef, Interface, Link, Project, Vlan } from '@server-planner/model';

/**
 * EngineContext — derived indexes shared by all analyses (docs/03 § 5.1, steps 1–3).
 * Built once per project version; every index is O(n).
 */
export interface EngineContext {
  project: Project;
  interfacesByOwner: Map<string, Interface[]>;
  linksByInterface: Map<string, Link[]>;
  vlanByVid: Map<number, Vlan>;
  /** Physical device that ultimately hosts a workload (bounded walk, cycle-safe). */
  deviceOfWorkload: Map<string, Device>;
  /** Interface → the device it belongs to (directly or via its workload). */
  deviceOfInterface: Map<string, Device>;
  /** Workloads and apps hosted directly by a device or workload. */
  hosted: Map<string, { workloads: string[]; apps: string[] }>;
}

const hostKey = (ref: HostRef) => `${ref.type}:${ref.id}`;

export function buildContext(project: Project): EngineContext {
  const interfacesByOwner = new Map<string, Interface[]>();
  for (const iface of Object.values(project.interfaces)) {
    const list = interfacesByOwner.get(iface.owner.id) ?? [];
    list.push(iface);
    interfacesByOwner.set(iface.owner.id, list);
  }
  const linksByInterface = new Map<string, Link[]>();
  for (const link of Object.values(project.links)) {
    for (const end of [link.a, link.b]) {
      const list = linksByInterface.get(end) ?? [];
      list.push(link);
      linksByInterface.set(end, list);
    }
  }
  const vlanByVid = new Map(Object.values(project.vlans).map((v) => [v.vid, v]));

  const deviceOfWorkload = new Map<string, Device>();
  for (const workload of Object.values(project.workloads)) {
    let host: HostRef | undefined = workload.host;
    for (let depth = 0; host && depth < 16; depth += 1) {
      if (host.type === 'device') {
        const device = project.devices[host.id];
        if (device) deviceOfWorkload.set(workload.id, device);
        break;
      }
      host = project.workloads[host.id]?.host;
    }
  }

  const deviceOfInterface = new Map<string, Device>();
  for (const iface of Object.values(project.interfaces)) {
    const device =
      iface.owner.type === 'device'
        ? project.devices[iface.owner.id]
        : deviceOfWorkload.get(iface.owner.id);
    if (device) deviceOfInterface.set(iface.id, device);
  }

  const hosted = new Map<string, { workloads: string[]; apps: string[] }>();
  const entry = (ref: HostRef) => {
    const key = hostKey(ref);
    let value = hosted.get(key);
    if (!value) {
      value = { workloads: [], apps: [] };
      hosted.set(key, value);
    }
    return value;
  };
  for (const w of Object.values(project.workloads)) entry(w.host).workloads.push(w.id);
  for (const a of Object.values(project.apps)) entry(a.runsOn).apps.push(a.id);

  return {
    project,
    interfacesByOwner,
    linksByInterface,
    vlanByVid,
    deviceOfWorkload,
    deviceOfInterface,
    hosted,
  };
}

export function hostedBy(ctx: EngineContext, ref: HostRef) {
  return ctx.hosted.get(hostKey(ref)) ?? { workloads: [], apps: [] };
}

/** The other end of a link from `interfaceId`. */
export function peerOf(link: Link, interfaceId: string): string {
  return link.a === interfaceId ? link.b : link.a;
}

/** VLAN IDs an interface carries: access VLAN, or trunk allowed (+ native); `all` = every VLAN. */
export function carriedVlans(ctx: EngineContext, iface: Interface): Set<string> | 'all' {
  const sp = iface.switchport;
  if (!sp) return new Set();
  if (sp.mode === 'access') return new Set(sp.accessVlanId ? [sp.accessVlanId] : []);
  if (sp.allowedVlanIds === 'all' || sp.allowedVlanIds === undefined) return 'all';
  const set = new Set(sp.allowedVlanIds.filter((id) => ctx.project.vlans[id]));
  if (sp.nativeVlanId) set.add(sp.nativeVlanId);
  return set;
}
