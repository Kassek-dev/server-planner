import { assignmentFamily, type Interface, type Project } from '@server-planner/model';

/**
 * EXP-07 host network configuration: ifupdown `/etc/network/interfaces` (Proxmox VE, Debian),
 * Netplan (Ubuntu Server) and DHCP reservations (dnsmasq `dhcp-host`). Every name and comment
 * comes from the project, which may be imported: names are reduced to what Linux accepts and
 * comments to one line, so nothing can add lines to the generated files.
 */

export type NetConfigFormat = 'ifupdown' | 'netplan';

/** Configuration format a device's OS uses, if any. */
export function netConfigFormat(project: Project, deviceId: string): NetConfigFormat | undefined {
  const os = project.devices[deviceId]?.os?.osId;
  if (os === 'proxmox-ve' || os === 'debian') return 'ifupdown';
  if (os === 'ubuntu-server') return 'netplan';
  return undefined;
}

const CONTROL = /[\p{C}\p{Zl}\p{Zp}]+/gu;
const oneLine = (text: string) => text.replace(CONTROL, ' ').trim();
/** Linux interface names: letters, digits, `.`, `_`, `-`; at most 15 characters. */
export const linuxName = (name: string) =>
  name.replace(/[^A-Za-z0-9._-]+/g, '').slice(0, 15) || 'if0';
const hostname = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || 'host';
const MAC = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;
const PHYSICAL = new Set(['rj45', 'sfp', 'sfp+', 'sfp28', 'qsfp+', 'wan', 'wifi-radio']);

interface HostIface {
  iface: Interface;
  name: string;
  kind: 'physical' | 'bridge' | 'vlan';
  /** Bridge ports (bridges) or the raw device (VLANs). */
  members: string[];
  parent?: string;
  vlan?: number;
  dhcp: boolean;
  /** `address/prefix` per static IPv4 address. */
  addresses: string[];
  /** NET-17 dual-stack: static IPv6 `address/prefix`, SLAAC, DHCPv6. */
  addresses6: string[];
  slaac: boolean;
  dhcp6: boolean;
  vlanAware: boolean;
}

function prefixOf(project: Project, subnetId: string | undefined): number | undefined {
  const cidr = subnetId ? project.subnets[subnetId]?.cidr : undefined;
  const prefix = cidr ? Number(cidr.split('/')[1]) : Number.NaN;
  return Number.isInteger(prefix) ? prefix : undefined;
}

function hostInterfaces(project: Project, deviceId: string): HostIface[] {
  const own = Object.values(project.interfaces)
    .filter((i) => i.owner.type === 'device' && i.owner.id === deviceId && i.enabled)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0) || a.name.localeCompare(b.name));
  const byId = new Map(own.map((i) => [i.id, i]));
  const nameOf = (i: Interface): string => {
    if (i.kind === 'vlan' && i.parentId && i.vlanTag) {
      const parent = byId.get(i.parentId);
      if (parent) return linuxName(`${linuxName(parent.name)}.${i.vlanTag}`);
    }
    return linuxName(i.name);
  };
  return own
    .filter((i) => PHYSICAL.has(i.kind) || i.kind === 'bridge' || i.kind === 'vlan')
    .map((i): HostIface => {
      const kind = i.kind === 'bridge' ? 'bridge' : i.kind === 'vlan' ? 'vlan' : 'physical';
      const members =
        kind === 'bridge'
          ? own.filter((m) => m.parentId === i.id && PHYSICAL.has(m.kind)).map(nameOf)
          : [];
      const parent = kind === 'vlan' && i.parentId ? byId.get(i.parentId) : undefined;
      const family = (a: Interface['addresses'][number]) => assignmentFamily(project, a);
      const statics = (v6: boolean) =>
        i.addresses.flatMap((a) => {
          if (!a.address || a.mode === 'dhcp' || (family(a) === 'ipv6') !== v6) return [];
          const prefix = prefixOf(project, a.subnetId);
          return [`${a.address}/${prefix ?? (v6 ? 128 : 32)}`];
        });
      const addresses = statics(false);
      const addresses6 = statics(true);
      return {
        iface: i,
        name: nameOf(i),
        kind,
        members,
        ...(parent ? { parent: nameOf(parent) } : {}),
        ...(kind === 'vlan' && i.vlanTag ? { vlan: i.vlanTag } : {}),
        dhcp: i.addresses.some((a) => a.mode === 'dhcp' && family(a) === 'ipv4'),
        addresses,
        addresses6,
        slaac: i.addresses.some((a) => a.mode === 'slaac'),
        dhcp6: i.addresses.some((a) => a.mode === 'dhcp' && family(a) === 'ipv6'),
        vlanAware:
          kind === 'bridge' &&
          (i.switchport?.mode === 'trunk' ||
            own.some((v) => v.kind === 'vlan' && v.parentId === i.id)),
      };
    });
}

/** Default gateway and DNS servers from the subnets of the device's static addresses. */
function routing(project: Project, ifaces: HostIface[]) {
  let gateway: string | undefined;
  let gateway6: string | undefined;
  const dns = new Set<string>();
  const own = new Set(
    ifaces.flatMap((i) => [...i.addresses, ...i.addresses6].map((a) => a.split('/')[0])),
  );
  for (const { iface } of ifaces)
    for (const a of iface.addresses) {
      const subnet = a.subnetId ? project.subnets[a.subnetId] : undefined;
      if (!subnet || !a.address || a.mode === 'dhcp') continue;
      const v6 = assignmentFamily(project, a) === 'ipv6';
      if (subnet.gateway && !own.has(subnet.gateway)) {
        if (v6) gateway6 ??= subnet.gateway;
        else gateway ??= subnet.gateway;
      }
      for (const s of subnet.dns?.servers ?? []) if (s.type === 'ip') dns.add(s.value);
    }
  return { gateway, gateway6, dns: [...dns] };
}

/** `/etc/network/interfaces` for ifupdown2 (Proxmox VE) or ifupdown (Debian). */
export function ifupdown(project: Project, deviceId: string): string {
  const device = project.devices[deviceId];
  const proxmox = device?.os?.osId === 'proxmox-ve';
  const ifaces = hostInterfaces(project, deviceId);
  const { gateway, gateway6, dns } = routing(project, ifaces);
  const bridged = new Set(ifaces.flatMap((i) => i.members));
  const out = [
    `# ${oneLine(device?.name ?? 'host')} — /etc/network/interfaces, generated by Server Planner`,
    '',
    'auto lo',
    'iface lo inet loopback',
  ];
  let gatewayUsed = false;
  let gateway6Used = false;
  for (const i of ifaces) {
    out.push('');
    const method = i.addresses.length > 0 ? 'static' : i.dhcp ? 'dhcp' : 'manual';
    const method6 =
      i.addresses6.length > 0 ? 'static' : i.dhcp6 ? 'dhcp' : i.slaac ? 'auto' : undefined;
    if (i.kind === 'physical' && bridged.has(i.name)) {
      out.push(`iface ${i.name} inet manual`);
      continue;
    }
    if (method !== 'manual' || method6 || i.kind !== 'physical') out.push(`auto ${i.name}`);
    out.push(`iface ${i.name} inet ${method}`);
    i.addresses.forEach((address, n) => {
      out.push(n === 0 ? `    address ${address}` : `    up ip addr add ${address} dev ${i.name}`);
    });
    if (method === 'static' && gateway && !gatewayUsed) {
      out.push(`    gateway ${gateway}`);
      gatewayUsed = true;
    }
    if (i.kind === 'bridge') {
      out.push(
        `    bridge-ports ${i.members.length > 0 ? i.members.join(' ') : 'none'}`,
        '    bridge-stp off',
        '    bridge-fd 0',
      );
      if (i.vlanAware) out.push('    bridge-vlan-aware yes', '    bridge-vids 2-4094');
    }
    if (i.kind === 'vlan' && i.parent && !proxmox) out.push(`    vlan-raw-device ${i.parent}`);
    if (method6) {
      out.push('', `iface ${i.name} inet6 ${method6}`);
      i.addresses6.forEach((address, n) => {
        out.push(
          n === 0 ? `    address ${address}` : `    up ip -6 addr add ${address} dev ${i.name}`,
        );
      });
      if (method6 === 'static' && gateway6 && !gateway6Used) {
        out.push(`    gateway ${gateway6}`);
        gateway6Used = true;
      }
    }
  }
  if (dns.length > 0) out.push('', `# DNS servers of the subnets: ${dns.join(' ')}`);
  return `${out.join('\n')}\n`;
}

/** Netplan YAML (`/etc/netplan/01-server-planner.yaml`) for Ubuntu Server. */
export function netplan(project: Project, deviceId: string): string {
  const device = project.devices[deviceId];
  const ifaces = hostInterfaces(project, deviceId);
  const { gateway, gateway6, dns } = routing(project, ifaces);
  const q = (value: string) => JSON.stringify(value);
  let gatewayUsed = false;
  let gateway6Used = false;
  const body = (i: HostIface, indent: string) => {
    const lines: string[] = [];
    if (i.dhcp && i.addresses.length === 0) lines.push(`${indent}dhcp4: true`);
    else lines.push(`${indent}dhcp4: false`);
    if (i.dhcp6) lines.push(`${indent}dhcp6: true`);
    if (i.slaac) lines.push(`${indent}accept-ra: true`);
    const all = [...i.addresses, ...i.addresses6];
    if (all.length > 0) {
      lines.push(`${indent}addresses: [${all.map(q).join(', ')}]`);
      const routes: string[] = [];
      if (gateway && !gatewayUsed && i.addresses.length > 0) {
        routes.push(`${indent}  - to: default`, `${indent}    via: ${q(gateway)}`);
        gatewayUsed = true;
      }
      if (gateway6 && !gateway6Used && i.addresses6.length > 0) {
        routes.push(`${indent}  - to: "::/0"`, `${indent}    via: ${q(gateway6)}`);
        gateway6Used = true;
      }
      if (routes.length > 0) lines.push(`${indent}routes:`, ...routes);
      if (dns.length > 0)
        lines.push(`${indent}nameservers:`, `${indent}  addresses: [${dns.map(q).join(', ')}]`);
    }
    return lines;
  };
  const section = (title: string, list: HostIface[], extra: (i: HostIface) => string[]) =>
    list.length === 0
      ? []
      : [
          `  ${title}:`,
          ...list.flatMap((i) => [`    ${q(i.name)}:`, ...extra(i), ...body(i, '      ')]),
        ];
  return `${[
    `# ${oneLine(device?.name ?? 'host')} — Netplan, generated by Server Planner`,
    'network:',
    '  version: 2',
    '  renderer: networkd',
    ...section(
      'ethernets',
      ifaces.filter((i) => i.kind === 'physical'),
      () => [],
    ),
    ...section(
      'bridges',
      ifaces.filter((i) => i.kind === 'bridge'),
      (i) => [`      interfaces: [${i.members.map(q).join(', ')}]`],
    ),
    ...section(
      'vlans',
      ifaces.filter((i) => i.kind === 'vlan' && i.parent && i.vlan),
      (i) => [`      id: ${i.vlan}`, `      link: ${q(i.parent ?? '')}`],
    ),
  ].join('\n')}\n`;
}

/** DHCP reservations of the project as dnsmasq `dhcp-host` lines (Pi-hole, OpenWrt, …). */
export function dhcpReservations(project: Project): string {
  const out = ['# DHCP reservations — generated by Server Planner'];
  const owner = (i: Interface) =>
    i.owner.type === 'device'
      ? project.devices[i.owner.id]?.name
      : project.workloads[i.owner.id]?.name;
  const rows = Object.values(project.interfaces)
    .flatMap((i) =>
      i.addresses
        .filter((a) => a.mode === 'dhcp-reservation' && a.address)
        .map((a) => ({ i, address: a.address as string, subnet: a.subnetId })),
    )
    .sort((a, b) => a.address.localeCompare(b.address, 'en', { numeric: true }));
  if (rows.length === 0) out.push('# No interface uses a DHCP reservation in this project.');
  for (const { i, address, subnet } of rows) {
    const host = hostname(owner(i) ?? 'host');
    const cidr = subnet ? project.subnets[subnet]?.cidr : undefined;
    out.push(`# ${oneLine(`${owner(i) ?? '?'} ${i.name}${cidr ? ` · ${cidr}` : ''}`)}`);
    out.push(
      i.mac && MAC.test(i.mac)
        ? `dhcp-host=${i.mac.toLowerCase()},${address},${host}`
        : `# dhcp-host=<MAC>,${address},${host}  (no MAC address in the project)`,
    );
  }
  return `${out.join('\n')}\n`;
}
