import {
  assignmentFamily,
  canonicalIp,
  isIpv6Cidr,
  type Project,
  type Subnet,
  subnetForAddress,
} from '@server-planner/model';

/** IP Plan (V-04, VIEW-03, NET-04): per-subnet address table with pool, conflicts and free ranges. */

export function ipv4ToInt(ip: string): number | undefined {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return undefined;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const v = Number(part);
    if (v > 255) return undefined;
    n = n * 256 + v;
  }
  return n;
}

export const intToIpv4 = (n: number) =>
  [24, 16, 8, 0].map((shift) => Math.floor(n / 2 ** shift) % 256).join('.');

export function parseCidr4(cidr: string): { network: number; prefix: number } | undefined {
  const [ip, p] = cidr.split('/');
  const base = ip ? ipv4ToInt(ip) : undefined;
  const prefix = Number(p);
  if (base === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 32)
    return undefined;
  const size = 2 ** (32 - prefix);
  return { network: base - (base % size), prefix };
}

export type AddressKind = 'static' | 'dhcp' | 'dhcp-reservation' | 'slaac' | 'gateway';

export interface AddressRow {
  type: 'address';
  ip: string;
  value: number;
  kind: AddressKind;
  /** Device or workload owning the interface. */
  owner: { type: 'device' | 'workload'; id: string; name: string } | undefined;
  iface: string;
  conflict: boolean;
  outside: boolean;
}

export interface RangeRow {
  type: 'free' | 'pool';
  from: string;
  to: string;
  count: number;
}

export interface SubnetPlan {
  subnet: Subnet;
  vlan: string;
  zone: string;
  /** Usable host addresses (IPv4 only; undefined for IPv6 or invalid CIDRs). */
  hosts?: number;
  used: number;
  pool?: { from: string; to: string; size: number; leases: number };
  rows: (AddressRow | RangeRow)[];
}

/** Largest subnet expanded into free ranges (bigger ones list only the used addresses). */
const MAX_EXPANDED_HOSTS = 65_534;

export function ipPlan(project: Project): SubnetPlan[] {
  const all: { ip: string; subnetId?: string; row: Omit<AddressRow, 'conflict' | 'outside'> }[] =
    [];
  const all6: { key: string; subnetId?: string; row: Omit<AddressRow, 'conflict' | 'outside'> }[] =
    [];
  for (const iface of Object.values(project.interfaces)) {
    const owner =
      iface.owner.type === 'device'
        ? project.devices[iface.owner.id]
        : project.workloads[iface.owner.id];
    for (const a of iface.addresses) {
      if (assignmentFamily(project, a) === 'ipv6') {
        // NET-17: IPv6 rows — SLAAC / DHCPv6 without an address are listed too.
        const subnetId =
          a.subnetId ?? (a.address ? subnetForAddress(project, a.address) : undefined);
        all6.push({
          key: a.address ? canonicalIp(a.address) : '',
          ...(subnetId ? { subnetId } : {}),
          row: {
            type: 'address',
            ip: a.address ? canonicalIp(a.address) : '',
            value: 0,
            kind: a.mode,
            owner: owner ? { type: iface.owner.type, id: owner.id, name: owner.name } : undefined,
            iface: iface.name,
          },
        });
        continue;
      }
      if (!a.address) continue;
      const value = ipv4ToInt(a.address);
      if (value === undefined) continue;
      all.push({
        ip: a.address,
        ...(a.subnetId ? { subnetId: a.subnetId } : {}),
        row: {
          type: 'address',
          ip: a.address,
          value,
          kind: a.mode,
          owner: owner ? { type: iface.owner.type, id: owner.id, name: owner.name } : undefined,
          iface: iface.name,
        },
      });
    }
  }
  const counts = new Map<string, number>();
  for (const a of all) counts.set(a.ip, (counts.get(a.ip) ?? 0) + 1);

  const counts6 = new Map<string, number>();
  for (const a of all6) if (a.key) counts6.set(a.key, (counts6.get(a.key) ?? 0) + 1);

  return Object.values(project.subnets)
    .sort(
      (a, b) =>
        Number(isIpv6Cidr(a.cidr)) - Number(isIpv6Cidr(b.cidr)) ||
        (ipv4ToInt(a.cidr.split('/')[0] ?? '') ?? 0) -
          (ipv4ToInt(b.cidr.split('/')[0] ?? '') ?? 0) ||
        a.cidr.localeCompare(b.cidr),
    )
    .map((subnet) => {
      const vlan6 = subnet.vlanId ? project.vlans[subnet.vlanId] : undefined;
      if (isIpv6Cidr(subnet.cidr)) {
        // IPv6: the addresses in use (no host count, pool or free ranges in a /64).
        const rows: AddressRow[] = all6
          .filter((a) => a.subnetId === subnet.id)
          .map((a) => ({
            ...a.row,
            conflict: !!a.key && (counts6.get(a.key) ?? 0) > 1,
            outside: false,
          }));
        if (subnet.gateway && !rows.some((r) => r.ip === canonicalIp(subnet.gateway ?? '')))
          rows.push({
            type: 'address',
            ip: canonicalIp(subnet.gateway),
            value: 0,
            kind: 'gateway',
            owner: undefined,
            iface: '',
            conflict: false,
            outside: false,
          });
        rows.sort(
          (a, b) =>
            Number(!a.ip) - Number(!b.ip) || a.ip.localeCompare(b.ip, 'en', { numeric: true }),
        );
        const zone6 = subnet.zoneId ? project.zones[subnet.zoneId] : undefined;
        return {
          subnet,
          vlan: vlan6 ? `${vlan6.vid} · ${vlan6.name}` : '',
          zone: zone6?.name ?? '',
          used: rows.length,
          rows,
        } satisfies SubnetPlan;
      }
      const net = parseCidr4(subnet.cidr);
      const vlan = subnet.vlanId ? project.vlans[subnet.vlanId] : undefined;
      const zone = subnet.zoneId ? project.zones[subnet.zoneId] : undefined;
      const inside = (v: number) =>
        !!net && v >= net.network && v < net.network + 2 ** (32 - net.prefix);
      const rows: AddressRow[] = all
        .filter((a) => a.subnetId === subnet.id || (!a.subnetId && inside(a.row.value)))
        .map((a) => ({
          ...a.row,
          conflict: (counts.get(a.ip) ?? 0) > 1,
          outside: !!net && !inside(a.row.value),
        }));
      const gw = subnet.gateway ? ipv4ToInt(subnet.gateway) : undefined;
      if (gw !== undefined && !rows.some((r) => r.value === gw)) {
        rows.push({
          type: 'address',
          ip: subnet.gateway ?? '',
          value: gw,
          kind: 'gateway',
          owner: undefined,
          iface: '',
          conflict: false,
          outside: !inside(gw),
        });
      }
      rows.sort((a, b) => a.value - b.value);

      const start = subnet.dhcp?.enabled ? ipv4ToInt(subnet.dhcp.rangeStart) : undefined;
      const end = subnet.dhcp?.enabled ? ipv4ToInt(subnet.dhcp.rangeEnd) : undefined;
      const poolSize =
        start !== undefined && end !== undefined && end >= start ? end - start + 1 : 0;
      const leases = rows.filter(
        (r) =>
          r.kind !== 'gateway' &&
          start !== undefined &&
          end !== undefined &&
          r.value >= start &&
          r.value <= end,
      ).length;
      const dhcpClients = Object.values(project.interfaces).filter((i) =>
        i.addresses.some((a) => a.mode === 'dhcp' && !a.address && a.subnetId === subnet.id),
      ).length;

      const plan: SubnetPlan = {
        subnet,
        vlan: vlan ? `${vlan.vid} · ${vlan.name}` : '',
        zone: zone?.name ?? '',
        used: rows.length,
        rows,
      };
      if (poolSize > 0 && start !== undefined && end !== undefined) {
        plan.pool = {
          from: intToIpv4(start),
          to: intToIpv4(end),
          size: poolSize,
          leases: leases + dhcpClients,
        };
      }
      if (!net || net.prefix > 30) return plan;
      const first = net.network + 1;
      const last = net.network + 2 ** (32 - net.prefix) - 2;
      plan.hosts = last - first + 1;
      if (plan.hosts > MAX_EXPANDED_HOSTS) return plan;

      // Walk the host range: addresses, the DHCP pool as one row, gaps as free ranges.
      const merged: (AddressRow | RangeRow)[] = [];
      const byValue = new Map<number, AddressRow[]>();
      for (const r of rows) byValue.set(r.value, [...(byValue.get(r.value) ?? []), r]);
      let freeFrom: number | undefined;
      const closeFree = (until: number) => {
        if (freeFrom === undefined) return;
        merged.push({
          type: 'free',
          from: intToIpv4(freeFrom),
          to: intToIpv4(until),
          count: until - freeFrom + 1,
        });
        freeFrom = undefined;
      };
      for (let v = first; v <= last; v += 1) {
        if (start !== undefined && end !== undefined && v === start && end >= start) {
          closeFree(v - 1);
          merged.push({
            type: 'pool',
            from: intToIpv4(start),
            to: intToIpv4(end),
            count: poolSize,
          });
          for (const r of rows) if (r.value >= start && r.value <= end) merged.push(r);
          v = Math.min(end, last);
          continue;
        }
        const here = byValue.get(v);
        if (here) {
          closeFree(v - 1);
          merged.push(...here);
        } else freeFrom ??= v;
      }
      closeFree(last);
      // Addresses outside the subnet stay visible at the end (VAL-02 territory).
      plan.rows = [...merged, ...rows.filter((r) => r.outside)];
      return plan;
    });
}
