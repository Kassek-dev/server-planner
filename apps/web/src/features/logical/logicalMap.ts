import {
  assignmentFamily,
  canonicalIp,
  type Project,
  subnetForAddress,
} from '@server-planner/model';

/**
 * VIEW-06 logical L3 diagram: the Internet, the routers and, per zone, its subnets — drawn from
 * addressing alone. A router connects to a subnet when one of its interfaces has an address in it
 * (or is the subnet's gateway); it reaches the Internet through a WAN interface. Pure.
 */

export interface LogicalSubnet {
  id: string;
  cidr: string;
  name?: string;
  vlan?: string;
  gateway?: string;
  /** Interfaces with an address in the subnet (static, reserved or automatic). */
  hosts: number;
  family: 'ipv4' | 'ipv6';
}

export interface LogicalZone {
  /** Zone ID, or '' for subnets without a zone. */
  id: string;
  name: string;
  color?: string;
  intraZone?: 'allow' | 'deny';
  subnets: LogicalSubnet[];
}

export interface LogicalRouter {
  id: string;
  name: string;
  /** Subnet IDs it has an interface in. */
  subnets: string[];
  wan: boolean;
  /** Default action of its firewall, when it has one. */
  policy?: 'allow' | 'deny';
  rules: number;
}

export interface LogicalMap {
  zones: LogicalZone[];
  routers: LogicalRouter[];
}

const ROUTING = new Set(['router', 'firewall']);

export function logicalMap(project: Project): LogicalMap {
  const hosts = new Map<string, number>();
  const bySubnet = (subnetId: string | undefined) =>
    subnetId && project.subnets[subnetId] ? subnetId : undefined;
  const routerSubnets = new Map<string, Set<string>>();
  const wan = new Set<string>();
  for (const iface of Object.values(project.interfaces)) {
    const deviceId = iface.owner.type === 'device' ? iface.owner.id : undefined;
    const device = deviceId ? project.devices[deviceId] : undefined;
    if (device && iface.kind === 'wan') wan.add(device.id);
    for (const a of iface.addresses) {
      const subnetId =
        bySubnet(a.subnetId) ?? (a.address ? subnetForAddress(project, a.address) : undefined);
      if (!subnetId) continue;
      hosts.set(subnetId, (hosts.get(subnetId) ?? 0) + 1);
      if (device && ROUTING.has(device.kind))
        routerSubnets.set(device.id, (routerSubnets.get(device.id) ?? new Set()).add(subnetId));
    }
  }
  // A gateway address held by a routing device ties it to the subnet too.
  const addressOwner = new Map<string, string>();
  for (const iface of Object.values(project.interfaces))
    for (const a of iface.addresses)
      if (a.address && iface.owner.type === 'device')
        addressOwner.set(canonicalIp(a.address), iface.owner.id);
  for (const subnet of Object.values(project.subnets)) {
    const owner = subnet.gateway ? addressOwner.get(canonicalIp(subnet.gateway)) : undefined;
    const device = owner ? project.devices[owner] : undefined;
    if (device && ROUTING.has(device.kind))
      routerSubnets.set(device.id, (routerSubnets.get(device.id) ?? new Set()).add(subnet.id));
  }

  const subnetOf = (id: string): LogicalSubnet | undefined => {
    const s = project.subnets[id];
    if (!s) return undefined;
    const vlan = s.vlanId ? project.vlans[s.vlanId] : undefined;
    return {
      id: s.id,
      cidr: s.cidr,
      ...(s.name ? { name: s.name } : {}),
      ...(vlan ? { vlan: `${vlan.vid} · ${vlan.name}` } : {}),
      ...(s.gateway ? { gateway: s.gateway } : {}),
      hosts: hosts.get(s.id) ?? 0,
      family: assignmentFamily(project, { mode: 'static', subnetId: s.id }),
    };
  };
  const order = (a: LogicalSubnet, b: LogicalSubnet) =>
    Number(a.family === 'ipv6') - Number(b.family === 'ipv6') ||
    a.cidr.localeCompare(b.cidr, 'en', { numeric: true });
  const zones: LogicalZone[] = Object.values(project.zones)
    .filter((z) => z.kind !== 'wan')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((z) => ({
      id: z.id,
      name: z.name,
      color: z.color,
      intraZone: z.intraZone,
      subnets: Object.values(project.subnets)
        .filter((s) => s.zoneId === z.id)
        .flatMap((s) => subnetOf(s.id) ?? [])
        .sort(order),
    }));
  const loose = Object.values(project.subnets)
    .filter((s) => !s.zoneId || !project.zones[s.zoneId] || project.zones[s.zoneId]?.kind === 'wan')
    .flatMap((s) => subnetOf(s.id) ?? [])
    .sort(order);
  if (loose.length > 0) zones.push({ id: '', name: '', subnets: loose });

  const routers: LogicalRouter[] = Object.values(project.devices)
    .filter((d) => ROUTING.has(d.kind) || routerSubnets.has(d.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => ({
      id: d.id,
      name: d.name,
      subnets: [...(routerSubnets.get(d.id) ?? [])],
      wan: wan.has(d.id),
      ...(d.firewall ? { policy: d.firewall.defaultAction } : {}),
      rules: d.firewall?.rules.length ?? 0,
    }));
  return { zones: zones.filter((z) => z.subnets.length > 0 || z.id), routers };
}
