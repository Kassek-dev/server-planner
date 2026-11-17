import {
  COMPUTE_KINDS,
  canonicalIp,
  checkRackFit,
  type Interface,
  isIpv6Cidr,
  type OsId,
  POOL_MIN_DISKS,
  runsGuest,
  SINGLE_LINK_KINDS,
  type Subnet,
  type Workload,
} from '@server-planner/model';
import ipaddr from 'ipaddr.js';
import { capacity as computeCapacity } from '../capacity';
import { type CpuArch, carriedVlans, type EngineContext, hostedBy, peerOf } from '../context';
import { addressesOf, proxyRoutes, resolveLocalName } from '../simulation/proxy';
import type { EntityRef, Issue, Severity } from '../types';

/** Validation rules — docs/01 § 8a (VAL-01…14) and docs/02 § 4.3 (rack). Codes map to issues.<code>. */
export interface ValidationRule {
  code: string;
  run(ctx: EngineContext): Issue[];
}

const issue = (
  code: string,
  severity: Severity,
  targets: EntityRef[],
  params: Issue['params'] = {},
  fix?: Issue['fix'],
): Issue => ({
  code,
  severity,
  params,
  targets,
  ...(fix ? { fix } : {}),
});

const name = (ctx: EngineContext, deviceId: string | undefined) =>
  deviceId ? (ctx.project.devices[deviceId]?.name ?? '?') : '?';
const ownerName = (ctx: EngineContext, iface: Interface) =>
  iface.owner.type === 'device'
    ? name(ctx, iface.owner.id)
    : (ctx.project.workloads[iface.owner.id]?.name ?? '?');
const ownerRef = (iface: Interface): EntityRef => ({
  type: iface.owner.type === 'device' ? 'device' : 'workload',
  id: iface.owner.id,
});

function parseIp(value: string | undefined) {
  if (!value || !ipaddr.isValid(value)) return undefined;
  return ipaddr.parse(value);
}
function parseCidr(cidr: string) {
  try {
    return ipaddr.parseCIDR(cidr);
  } catch {
    return undefined;
  }
}
function inSubnet(address: string, subnet: Subnet): boolean {
  const ip = parseIp(address);
  const net = parseCidr(subnet.cidr);
  return !!ip && !!net && ip.kind() === net[0].kind() && ip.match(net);
}
const toNumber = (ip: ipaddr.IPv4 | ipaddr.IPv6) =>
  ip.kind() === 'ipv4' ? (ip as ipaddr.IPv4).toByteArray().reduce((n, b) => n * 256 + b, 0) : 0;
function inDhcpRange(address: string, subnet: Subnet): boolean {
  const ip = parseIp(address);
  const start = parseIp(subnet.dhcp?.rangeStart);
  const end = parseIp(subnet.dhcp?.rangeEnd);
  if (!subnet.dhcp?.enabled || !ip || !start || !end || ip.kind() !== 'ipv4') return false;
  const n = toNumber(ip);
  return n >= toNumber(start) && n <= toNumber(end);
}

/** First free IPv4 host address in a subnet, outside its DHCP pool and not already used. */
export function freeAddress(ctx: EngineContext, subnet: Subnet): string | undefined {
  const net = parseCidr(subnet.cidr);
  if (net?.[0].kind() !== 'ipv4' || net[1] < 8) return undefined;
  const used = new Set<string>();
  for (const iface of Object.values(ctx.project.interfaces))
    for (const a of iface.addresses) if (a.address) used.add(a.address);
  if (subnet.gateway) used.add(subnet.gateway);
  const base = toNumber(net[0]);
  const size = 2 ** (32 - net[1]);
  for (let i = 2; i < Math.min(size - 1, 4096); i += 1) {
    const n = base + i;
    const candidate = [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
    if (!used.has(candidate) && !inDhcpRange(candidate, subnet)) return candidate;
  }
  return undefined;
}

/** The interface's addresses with one replaced — a fix keeps the other family (dual-stack). */
const replaceAddress = (
  iface: Interface,
  address: string,
  next: Interface['addresses'][number],
): Interface['addresses'] => {
  const key = canonicalIp(address);
  return iface.addresses.map((a) => (a.address && canonicalIp(a.address) === key ? next : a));
};

const staticAddresses = (ctx: EngineContext) =>
  Object.values(ctx.project.interfaces).flatMap((iface) =>
    iface.addresses
      .filter((a) => a.address && a.mode !== 'dhcp')
      .map((a) => ({ iface, address: a.address as string, subnetId: a.subnetId })),
  );

/** VAL-01 duplicate IP address. */
const duplicateIp: ValidationRule = {
  code: 'VAL_01',
  run(ctx) {
    const byAddress = new Map<string, { iface: Interface; subnetId: string | undefined }[]>();
    for (const entry of staticAddresses(ctx)) {
      // IPv6 has many spellings of one address (`2001:db8::1` = `2001:DB8:0::1`).
      const key = canonicalIp(entry.address);
      const list = byAddress.get(key) ?? [];
      list.push(entry);
      byAddress.set(key, list);
    }
    return [...byAddress.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([address, list]) => {
        const last = list[list.length - 1];
        const subnet = last?.subnetId ? ctx.project.subnets[last.subnetId] : undefined;
        const free = subnet ? freeAddress(ctx, subnet) : undefined;
        return issue(
          'VAL_01',
          'error',
          list.flatMap(({ iface }) => [
            ownerRef(iface),
            { type: 'interface' as const, id: iface.id },
          ]),
          {
            ip: address,
            count: list.length - 1,
            targets: list.map(({ iface }) => `${ownerName(ctx, iface)}:${iface.name}`).join(', '),
          },
          last && free
            ? {
                command: 'interface.update',
                payload: {
                  id: last.iface.id,
                  changes: {
                    addresses: replaceAddress(last.iface, address, {
                      mode: 'static',
                      address: free,
                      ...(subnet ? { subnetId: subnet.id } : {}),
                    }),
                  },
                },
              }
            : undefined,
        );
      });
  },
};

/** VAL-02 IP outside the interface's subnet (assigned subnet or VLAN-tag subnet). */
const ipOutsideSubnet: ValidationRule = {
  code: 'VAL_02',
  run(ctx) {
    const out: Issue[] = [];
    for (const { iface, address, subnetId } of staticAddresses(ctx)) {
      const assigned = subnetId ? ctx.project.subnets[subnetId] : undefined;
      if (assigned && !inSubnet(address, assigned)) {
        out.push(
          issue('VAL_02', 'error', [ownerRef(iface), { type: 'interface', id: iface.id }], {
            ip: address,
            subnet: assigned.cidr,
            target: `${ownerName(ctx, iface)}:${iface.name}`,
          }),
        );
        continue;
      }
      if (iface.vlanTag !== undefined) {
        const vlan = ctx.vlanByVid.get(iface.vlanTag);
        const subnets = Object.values(ctx.project.subnets).filter((s) => s.vlanId === vlan?.id);
        if (vlan && subnets.length > 0 && !subnets.some((s) => inSubnet(address, s))) {
          out.push(
            issue('VAL_02', 'error', [ownerRef(iface), { type: 'interface', id: iface.id }], {
              ip: address,
              subnet: subnets.map((s) => s.cidr).join(', '),
              target: `${ownerName(ctx, iface)}:${iface.name}`,
            }),
          );
        }
      }
    }
    return out;
  },
};

/** VAL-03 static IP inside a DHCP pool. */
const staticInDhcp: ValidationRule = {
  code: 'VAL_03',
  run(ctx) {
    return staticAddresses(ctx)
      .filter(
        (e) =>
          e.subnetId &&
          e.iface.addresses.some((a) => a.address === e.address && a.mode === 'static'),
      )
      .flatMap(({ iface, address, subnetId }) => {
        const subnet = subnetId ? ctx.project.subnets[subnetId] : undefined;
        if (!subnet || !inDhcpRange(address, subnet)) return [];
        const free = freeAddress(ctx, subnet);
        return [
          issue(
            'VAL_03',
            'warning',
            [ownerRef(iface), { type: 'interface', id: iface.id }],
            {
              ip: address,
              target: `${ownerName(ctx, iface)}:${iface.name}`,
              start: subnet.dhcp?.rangeStart ?? '',
              end: subnet.dhcp?.rangeEnd ?? '',
            },
            free
              ? {
                  command: 'interface.update',
                  payload: {
                    id: iface.id,
                    changes: {
                      addresses: replaceAddress(iface, address, {
                        mode: 'static',
                        address: free,
                        subnetId: subnet.id,
                      }),
                    },
                  },
                }
              : undefined,
          ),
        ];
      });
  },
};

const vlanLabel = (ctx: EngineContext, id: string) => {
  const v = ctx.project.vlans[id];
  return v ? `${v.vid}` : '?';
};

/**
 * VAL-04 VLAN mismatch on a link: access ↔ access with different VLANs, access VLAN not carried by the
 * trunk on the other end, and SSID VLANs of an access point not allowed on its uplink trunk.
 */
const vlanMismatch: ValidationRule = {
  code: 'VAL_04',
  run(ctx) {
    const out: Issue[] = [];
    for (const link of Object.values(ctx.project.links)) {
      if (link.medium === 'virtual' || link.medium === 'wifi') continue;
      const a = ctx.project.interfaces[link.a];
      const b = ctx.project.interfaces[link.b];
      if (!a?.switchport || !b?.switchport) continue;
      const pairs: [Interface, Interface][] = [
        [a, b],
        [b, a],
      ];
      for (const [x, y] of pairs) {
        if (x.switchport?.mode !== 'access' || !x.switchport.accessVlanId) continue;
        const carried = carriedVlans(ctx, y);
        if (carried === 'all' || carried.has(x.switchport.accessVlanId)) continue;
        out.push(
          issue(
            'VAL_04',
            'error',
            [{ type: 'link', id: link.id }, ownerRef(y), { type: 'interface', id: y.id }],
            {
              vlan: vlanLabel(ctx, x.switchport.accessVlanId),
              device: ownerName(ctx, y),
              port: y.name,
            },
          ),
        );
        break;
      }
    }
    // Access points: every SSID VLAN must reach the AP over its wired uplink.
    for (const device of Object.values(ctx.project.devices)) {
      const ssidVlans = [
        ...new Set((device.wifi?.ssids ?? []).map((s) => s.vlanId).filter((v): v is string => !!v)),
      ];
      if (ssidVlans.length === 0) continue;
      const uplinks = (ctx.interfacesByOwner.get(device.id) ?? []).filter(
        (i) => i.kind !== 'wifi-radio',
      );
      for (const uplink of uplinks) {
        for (const link of ctx.linksByInterface.get(uplink.id) ?? []) {
          const far = ctx.project.interfaces[peerOf(link, uplink.id)];
          if (!far?.switchport) continue;
          const carried = carriedVlans(ctx, far);
          if (carried === 'all') continue;
          for (const vlanId of ssidVlans) {
            if (carried.has(vlanId)) continue;
            const sp = far.switchport;
            const fix =
              sp.mode === 'trunk' && Array.isArray(sp.allowedVlanIds)
                ? {
                    command: 'interface.update',
                    payload: {
                      id: far.id,
                      changes: {
                        switchport: { ...sp, allowedVlanIds: [...sp.allowedVlanIds, vlanId] },
                      },
                    },
                  }
                : undefined;
            out.push(
              issue(
                'VAL_04',
                'error',
                [
                  { type: 'link', id: link.id },
                  ownerRef(far),
                  { type: 'interface', id: far.id },
                  { type: 'device', id: device.id },
                ],
                { vlan: vlanLabel(ctx, vlanId), device: ownerName(ctx, far), port: far.name },
                fix,
              ),
            );
          }
        }
      }
    }
    return out;
  },
};

const FIBER = new Set(['sfp', 'sfp+', 'sfp28', 'qsfp+']);
const COPPER = new Set(['rj45', 'wan']);

/** VAL-05 medium (copper ↔ fiber) or speed mismatch on a cable. */
const mediumMismatch: ValidationRule = {
  code: 'VAL_05',
  run(ctx) {
    const out: Issue[] = [];
    for (const link of Object.values(ctx.project.links)) {
      const a = ctx.project.interfaces[link.a];
      const b = ctx.project.interfaces[link.b];
      if (!a || !b || link.medium === 'virtual' || link.medium === 'wifi') continue;
      const ends = `${ownerName(ctx, a)}:${a.name} ⇄ ${ownerName(ctx, b)}:${b.name}`;
      if ((COPPER.has(a.kind) && FIBER.has(b.kind)) || (FIBER.has(a.kind) && COPPER.has(b.kind))) {
        out.push(
          issue('VAL_05', 'warning', [{ type: 'link', id: link.id }], {
            ends,
            detail: `${a.kind} ⇄ ${b.kind}`,
          }),
        );
      } else if (a.speedMbps && b.speedMbps && a.speedMbps !== b.speedMbps) {
        out.push(
          issue('VAL_05_SPEED', 'info', [{ type: 'link', id: link.id }], {
            ends,
            speed: Math.min(a.speedMbps, b.speedMbps),
          }),
        );
      }
    }
    return out;
  },
};

const SWITCHING = new Set(['switch', 'access-point']);

/** VAL-06 L2 loop: a cycle of cables between switching devices (no STP is modelled). */
const l2Loop: ValidationRule = {
  code: 'VAL_06',
  run(ctx) {
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let root = x;
      while (parent.get(root) !== root && parent.get(root) !== undefined)
        root = parent.get(root) as string;
      parent.set(x, root);
      return root;
    };
    const out: Issue[] = [];
    for (const link of Object.values(ctx.project.links)) {
      if (link.medium === 'virtual' || link.medium === 'wifi') continue;
      const da = ctx.deviceOfInterface.get(link.a);
      const db = ctx.deviceOfInterface.get(link.b);
      if (!da || !db || !SWITCHING.has(da.kind) || !SWITCHING.has(db.kind)) continue;
      for (const id of [da.id, db.id]) if (!parent.has(id)) parent.set(id, id);
      const ra = find(da.id);
      const rb = find(db.id);
      if (ra === rb)
        out.push(
          issue(
            'VAL_06',
            'warning',
            [
              { type: 'link', id: link.id },
              { type: 'device', id: da.id },
              { type: 'device', id: db.id },
            ],
            { a: da.name, b: db.name },
          ),
        );
      else parent.set(ra, rb);
    }
    return out;
  },
};

/** VAL-07 VLAN without subnet; subnet without gateway. */
const vlanSubnetGaps: ValidationRule = {
  code: 'VAL_07',
  run(ctx) {
    const out: Issue[] = [];
    for (const vlan of Object.values(ctx.project.vlans)) {
      if (!Object.values(ctx.project.subnets).some((s) => s.vlanId === vlan.id)) {
        out.push(
          issue('VAL_07_VLAN', 'warning', [{ type: 'vlan', id: vlan.id }], {
            vlan: vlan.vid,
            name: vlan.name,
          }),
        );
      }
    }
    for (const subnet of Object.values(ctx.project.subnets)) {
      if (subnet.gateway) continue;
      const net = parseCidr(subnet.cidr);
      const first =
        net && net[0].kind() === 'ipv4'
          ? (() => {
              const n = toNumber(net[0]) + 1;
              return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
            })()
          : undefined;
      out.push(
        issue(
          'VAL_07_GATEWAY',
          'warning',
          [{ type: 'subnet', id: subnet.id }],
          { subnet: subnet.cidr },
          first
            ? { command: 'subnet.update', payload: { id: subnet.id, changes: { gateway: first } } }
            : undefined,
        ),
      );
    }
    return out;
  },
};

/** VAL-08 socket used twice (imported data) / device with no connection at all. */
const portUsage: ValidationRule = {
  code: 'VAL_08',
  run(ctx) {
    const out: Issue[] = [];
    for (const iface of Object.values(ctx.project.interfaces)) {
      const links = ctx.linksByInterface.get(iface.id) ?? [];
      if (SINGLE_LINK_KINDS.includes(iface.kind) && links.length > 1) {
        out.push(
          issue('VAL_08', 'error', [ownerRef(iface), { type: 'interface', id: iface.id }], {
            target: `${ownerName(ctx, iface)}:${iface.name}`,
            count: links.length,
          }),
        );
      }
    }
    for (const device of Object.values(ctx.project.devices)) {
      const connected = (ctx.interfacesByOwner.get(device.id) ?? []).some(
        (i) => (ctx.linksByInterface.get(i.id) ?? []).length > 0,
      );
      if (!connected && device.kind !== 'patch-panel' && device.kind !== 'ups') {
        out.push(
          issue('VAL_08_ISOLATED', 'info', [{ type: 'device', id: device.id }], {
            device: device.name,
          }),
        );
      }
    }
    return out;
  },
};

/** VAL-09 overlapping subnets. */
const overlappingSubnets: ValidationRule = {
  code: 'VAL_09',
  run(ctx) {
    const subnets = Object.values(ctx.project.subnets)
      .map((s) => ({ s, net: parseCidr(s.cidr) }))
      .filter((x): x is { s: Subnet; net: [ipaddr.IPv4 | ipaddr.IPv6, number] } => !!x.net);
    const out: Issue[] = [];
    for (let i = 0; i < subnets.length; i += 1) {
      for (let j = i + 1; j < subnets.length; j += 1) {
        const a = subnets[i];
        const b = subnets[j];
        if (!a || !b || a.net[0].kind() !== b.net[0].kind()) continue;
        if (a.net[0].match(b.net) || b.net[0].match(a.net)) {
          out.push(
            issue(
              'VAL_09',
              'error',
              [
                { type: 'subnet', id: a.s.id },
                { type: 'subnet', id: b.s.id },
              ],
              { a: a.s.cidr, b: b.s.cidr },
            ),
          );
        }
      }
    }
    return out;
  },
};

/** VAL-10 two services on the same port of the same host (published Docker ports or host-network apps). */
const portConflict: ValidationRule = {
  code: 'VAL_10',
  run(ctx) {
    const out: Issue[] = [];
    const hosts = [
      ...Object.values(ctx.project.devices).map((d) => ({
        ref: { type: 'device' as const, id: d.id },
        name: d.name,
      })),
      ...Object.values(ctx.project.workloads)
        .filter((w) => w.kind !== 'container')
        .map((w) => ({ ref: { type: 'workload' as const, id: w.id }, name: w.name })),
    ];
    for (const host of hosts) {
      const used = new Map<string, string[]>();
      const add = (key: string, who: string) => used.set(key, [...(used.get(key) ?? []), who]);
      const { workloads, apps } = hostedBy(ctx, host.ref);
      for (const id of workloads) {
        const w = ctx.project.workloads[id];
        if (w?.kind !== 'container') continue;
        if (w.network.mode === 'host') {
          for (const appId of hostedBy(ctx, { type: 'workload', id }).apps) {
            for (const l of ctx.project.apps[appId]?.listeners ?? [])
              add(`${l.protocol}/${l.port}`, w.name);
          }
        } else {
          for (const p of w.portMappings) add(`${p.protocol}/${p.hostPort}`, w.name);
        }
      }
      for (const appId of apps) {
        const app = ctx.project.apps[appId];
        for (const l of app?.listeners ?? []) add(`${l.protocol}/${l.port}`, app?.name ?? '?');
      }
      for (const [port, who] of used) {
        if (who.length > 1)
          out.push(
            issue('VAL_10', 'error', [host.ref], {
              host: host.name,
              port,
              services: who.join(', '),
            }),
          );
      }
    }
    return out;
  },
};

/** VAL-11 OS compatibility: VMs/LXC need a hypervisor; Docker on Proxmox or Windows Server. */
const osCompatibility: ValidationRule = {
  code: 'VAL_11',
  run(ctx) {
    const out: Issue[] = [];
    for (const w of Object.values(ctx.project.workloads)) {
      if (w.kind === 'container' || w.host.type !== 'device') continue;
      const host = ctx.project.devices[w.host.id];
      if (host && !runsGuest(host.os?.osId, w.kind)) {
        out.push(
          issue(
            'VAL_11_HYPERVISOR',
            'error',
            [
              { type: 'workload', id: w.id },
              { type: 'device', id: host.id },
            ],
            {
              workload: w.name,
              host: host.name,
              kind: w.kind.toUpperCase(),
              guest: w.kind,
              os: host.os?.osId ?? 'none',
            },
          ),
        );
      }
    }
    for (const device of Object.values(ctx.project.devices)) {
      if (!device.docker) continue;
      if (device.os?.osId === 'proxmox-ve')
        out.push(
          issue('VAL_11_DOCKER_PVE', 'warning', [{ type: 'device', id: device.id }], {
            host: device.name,
          }),
        );
      if (device.os?.osId === 'windows-server')
        out.push(
          issue('VAL_11_DOCKER_WIN', 'warning', [{ type: 'device', id: device.id }], {
            host: device.name,
          }),
        );
    }
    for (const device of Object.values(ctx.project.devices)) {
      if (COMPUTE_KINDS.includes(device.kind) || !device.os) continue;
      out.push(
        issue('VAL_11_NOT_COMPUTE', 'warning', [{ type: 'device', id: device.id }], {
          device: device.name,
        }),
      );
    }
    return out;
  },
};

/**
 * SW-12 architecture: a host OS or VM guest OS for another CPU architecture, and container images
 * not built for the CPU of the device that finally runs them. Unknown images and OSes are skipped.
 */
const archCompatibility: ValidationRule = {
  code: 'VAL_ARCH',
  run(ctx) {
    const out: Issue[] = [];
    const cpuArch = (deviceId: string | undefined) =>
      deviceId ? ctx.project.devices[deviceId]?.hardware.cpus[0]?.arch : undefined;
    const checkOs = (osId: OsId, arch: CpuArch, targets: EntityRef[], host: string) => {
      const supported = ctx.osArch[osId];
      if (supported && !supported.includes(arch))
        out.push(issue('VAL_ARCH_OS', 'error', targets, { host, os: osId, arch }));
    };
    for (const device of Object.values(ctx.project.devices)) {
      const arch = cpuArch(device.id);
      if (arch && device.os)
        checkOs(device.os.osId, arch, [{ type: 'device', id: device.id }], device.name);
    }
    for (const w of Object.values(ctx.project.workloads)) {
      const device = ctx.deviceOfWorkload.get(w.id);
      const arch = cpuArch(device?.id);
      if (!device || !arch) continue;
      const targets: EntityRef[] = [
        { type: 'workload', id: w.id },
        { type: 'device', id: device.id },
      ];
      if (w.kind === 'vm') checkOs(w.guestOs.osId, arch, targets, w.name);
      if (w.kind !== 'container') continue;
      const supported = ctx.imageArch[w.image];
      if (supported && !supported.includes(arch))
        out.push(
          issue('VAL_ARCH', 'error', targets, {
            container: w.name,
            image: w.image,
            host: device.name,
            arch,
            supported: supported.join(', '),
          }),
        );
    }
    return out;
  },
};

/**
 * NET-11 / NET-14: a proxy route whose proxy cannot reach the app behind it (VAL_PROXY), a local
 * A record for an address nothing in the project has (VAL_DNS_ADDRESS), and a proxied host name
 * whose local record points elsewhere than the proxy (VAL_PROXY_DNS).
 */
const proxyAndDns: ValidationRule = {
  code: 'VAL_PROXY',
  run(ctx) {
    const p = ctx.project;
    const out: Issue[] = [];
    const appName = (id: string) => p.apps[id]?.name ?? '?';
    for (const r of proxyRoutes(ctx)) {
      if (r.result.verdict === 'reachable') continue;
      out.push(
        issue(
          'VAL_PROXY',
          'error',
          [
            { type: 'app', id: r.appId },
            { type: 'app', id: r.proxyAppId },
          ],
          {
            hostname: r.hostname,
            proxy: appName(r.proxyAppId),
            app: appName(r.appId),
            port: r.port,
          },
        ),
      );
    }
    const used = new Set(
      Object.values(p.interfaces).flatMap((i) =>
        i.addresses.flatMap((a) => (a.address ? [a.address] : [])),
      ),
    );
    for (const w of Object.values(p.workloads))
      if (w.kind === 'container' && w.network.mode === 'docker-network' && w.network.ip)
        used.add(w.network.ip);
    for (const record of Object.values(p.dnsRecords)) {
      if (record.type !== 'A' || used.has(record.value)) continue;
      out.push(
        issue('VAL_DNS_ADDRESS', 'warning', [{ type: 'dnsRecord', id: record.id }], {
          name: record.name,
          address: record.value,
        }),
      );
    }
    for (const route of Object.values(p.proxyRoutes)) {
      const resolved = resolveLocalName(ctx, route.hostname);
      if (!resolved) continue;
      const proxy = addressesOf(ctx, { type: 'app', id: route.proxyAppId });
      if (resolved.some((ip) => proxy.includes(ip))) continue;
      out.push(
        issue(
          'VAL_PROXY_DNS',
          'warning',
          [
            { type: 'proxyRoute', id: route.id },
            { type: 'app', id: route.proxyAppId },
          ],
          {
            hostname: route.hostname,
            proxy: appName(route.proxyAppId),
            resolved: resolved.join(', ') || '—',
          },
        ),
      );
    }
    return out;
  },
};

/** HW-03 storage pool with fewer disks than its layout needs (0 disks: nothing to store on). */
const poolDisks: ValidationRule = {
  code: 'VAL_POOL',
  run(ctx) {
    const out: Issue[] = [];
    for (const device of Object.values(ctx.project.devices)) {
      const disks = new Set(device.hardware.disks.map((d) => d.id));
      for (const pool of device.hardware.pools) {
        const count = pool.diskIds.filter((id) => disks.has(id)).length;
        const needed = POOL_MIN_DISKS[pool.layout];
        if (count >= needed) continue;
        out.push(
          issue(
            'VAL_POOL',
            count === 0 ? 'error' : 'warning',
            [
              { type: 'pool', id: pool.id },
              { type: 'device', id: device.id },
            ],
            { device: device.name, pool: pool.name, layout: pool.layout, needed, count },
          ),
        );
      }
    }
    return out;
  },
};

/**
 * NET-17 IPv6 addressing: SLAAC only on IPv6 subnets and only where routers announce it, DHCPv6
 * only on managed (dhcpv6) subnets; SLAAC needs a /64 prefix.
 */
const ipv6Rules: ValidationRule = {
  code: 'VAL_IPV6',
  run(ctx) {
    const out: Issue[] = [];
    const p = ctx.project;
    for (const iface of Object.values(p.interfaces))
      for (const a of iface.addresses) {
        const subnet = a.subnetId ? p.subnets[a.subnetId] : undefined;
        const v6Subnet = subnet ? isIpv6Cidr(subnet.cidr) : false;
        const ra = subnet?.ra ?? 'slaac';
        const target = `${ownerName(ctx, iface)}:${iface.name}`;
        const refs = [ownerRef(iface), { type: 'interface' as const, id: iface.id }];
        let problem: string | undefined;
        if (a.mode === 'slaac' && subnet && !v6Subnet) problem = 'slaac-ipv4';
        else if (a.mode === 'slaac' && v6Subnet && ra !== 'slaac') problem = 'slaac-off';
        else if (a.mode === 'dhcp' && v6Subnet && ra !== 'dhcpv6') problem = 'dhcpv6-off';
        if (problem)
          out.push(
            issue('VAL_IPV6_MODE', problem === 'slaac-ipv4' ? 'error' : 'warning', refs, {
              target,
              problem,
              subnet: subnet?.cidr ?? '',
            }),
          );
      }
    for (const subnet of Object.values(p.subnets)) {
      const net = parseCidr(subnet.cidr);
      if (net?.[0].kind() !== 'ipv6' || (subnet.ra ?? 'slaac') !== 'slaac' || net[1] === 64)
        continue;
      out.push(
        issue('VAL_IPV6_PREFIX', 'warning', [{ type: 'subnet', id: subnet.id }], {
          subnet: subnet.cidr,
          prefix: net[1],
        }),
      );
    }
    return out;
  },
};

/**
 * NET-16 bonds: a bond needs at least two ports; with LACP the other end must bundle the same
 * cables into one bond too (a host bond or a switch LAG), or the links flap.
 */
const bondRules: ValidationRule = {
  code: 'VAL_BOND',
  run(ctx) {
    const out: Issue[] = [];
    const p = ctx.project;
    for (const bond of Object.values(p.interfaces)) {
      if (bond.kind !== 'bond') continue;
      const owner = ownerName(ctx, bond);
      const members = Object.values(p.interfaces).filter((i) => i.parentId === bond.id);
      const refs = [ownerRef(bond), { type: 'interface' as const, id: bond.id }];
      if (members.length < 2)
        out.push(
          issue('VAL_BOND_PORTS', 'warning', refs, {
            target: `${owner}:${bond.name}`,
            count: members.length,
          }),
        );
      if (bond.bond?.mode !== 'lacp') continue;
      const peers = members.flatMap((m) =>
        (ctx.linksByInterface.get(m.id) ?? []).map((l) => p.interfaces[l.a === m.id ? l.b : l.a]),
      );
      const peerBonds = new Set(peers.map((peer) => peer?.parentId));
      const bundled =
        peers.length > 0 &&
        peerBonds.size === 1 &&
        peers.every((peer) => {
          const parent = peer?.parentId ? p.interfaces[peer.parentId] : undefined;
          return parent?.kind === 'bond';
        });
      if (peers.length > 1 && !bundled)
        out.push(
          issue('VAL_BOND_PEER', 'warning', refs, {
            target: `${owner}:${bond.name}`,
            peers: [
              ...new Set(
                peers.flatMap((peer) => (peer ? [`${ownerName(ctx, peer)}:${peer.name}`] : [])),
              ),
            ].join(', '),
          }),
        );
    }
    return out;
  },
};

const GIB = 1024 ** 3;
const gib = (bytes: number) => Math.round((bytes / GIB) * 10) / 10;

/**
 * LIB-05 the parts fit the board: memory up to its maximum, modules in its slots, cards, M.2
 * modules and SATA drives in its slots and bays. NVMe disks count as M.2, HDDs and SATA SSDs as
 * bays. Only limits the device knows (from its catalog model or entered) are checked.
 */
const hardwareFit: ValidationRule = {
  code: 'VAL_FIT',
  run(ctx) {
    const out: Issue[] = [];
    for (const device of Object.values(ctx.project.devices)) {
      const hw = device.hardware;
      const ref = [{ type: 'device' as const, id: device.id }];
      const memory = hw.memory;
      if (memory) {
        const total = memory.modules.reduce((s, m) => s + m.sizeBytes * m.count, 0);
        if (memory.maxBytes !== undefined && total > memory.maxBytes)
          out.push(
            issue('VAL_RAM_MAX', 'warning', ref, {
              device: device.name,
              total: gib(total),
              max: gib(memory.maxBytes),
            }),
          );
        const modules = memory.modules.filter((m) => !m.soldered).reduce((s, m) => s + m.count, 0);
        if (memory.slotsTotal !== undefined && modules > memory.slotsTotal)
          out.push(
            issue('VAL_RAM_SLOTS', 'error', ref, {
              device: device.name,
              modules,
              slots: memory.slotsTotal,
            }),
          );
      }
      const slots = hw.expansion;
      if (!slots) continue;
      const cards = hw.cards ?? [];
      const used = {
        pcie:
          cards.filter((c) => c.slot === 'pcie').length +
          hw.gpus.filter((g) => g.attach === 'pcie').length,
        m2:
          cards.filter((c) => c.slot === 'm2').length +
          hw.gpus.filter((g) => g.attach === 'm2').length +
          hw.disks.filter((d) => d.type === 'ssd-nvme').length,
        sata: hw.disks.filter((d) => d.type === 'hdd' || d.type === 'ssd-sata').length,
      };
      const total = { pcie: slots.pcieSlots, m2: slots.m2Slots, sata: slots.sataBays };
      for (const slot of ['pcie', 'm2', 'sata'] as const) {
        const limit = total[slot];
        if (limit !== undefined && used[slot] > limit)
          out.push(
            issue('VAL_SLOTS', 'error', ref, {
              device: device.name,
              slot,
              used: used[slot],
              total: limit,
            }),
          );
      }
    }
    return out;
  },
};

const RESOURCE_LABEL = { cpu: 'CPU', memory: 'memory' } as const;

/** VAL-13 capacity above thresholds (critical/over = error from 100 %, warning band = warning). */
const capacityRule: ValidationRule = {
  code: 'VAL_13',
  run(ctx) {
    const out: Issue[] = [];
    for (const report of Object.values(computeCapacity(ctx))) {
      const hostName =
        report.host.type === 'device'
          ? name(ctx, report.host.id)
          : (ctx.project.workloads[report.host.id]?.name ?? '?');
      const entries: [string, typeof report.cpu][] = [
        [RESOURCE_LABEL.cpu, report.cpu],
        [RESOURCE_LABEL.memory, report.memory],
        ...report.storage.map((s) => {
          const device =
            report.host.type === 'device' ? ctx.project.devices[report.host.id] : undefined;
          return [device?.hardware.pools.find((p) => p.id === s.poolId)?.name ?? 'pool', s] as [
            string,
            typeof s,
          ];
        }),
      ];
      for (const [resource, usage] of entries) {
        if (usage.status === 'ok') continue;
        out.push(
          issue(
            usage.status === 'over' ? 'VAL_13_OVER' : 'VAL_13',
            usage.status === 'over' ? 'error' : 'warning',
            [report.host],
            {
              host: hostName,
              resource,
              percent: Math.round(usage.ratio * 100),
            },
          ),
        );
      }
    }
    return out;
  },
};

/**
 * GPU (CAP-01, HW-05): an app asking for an accelerator its host cannot give it. A VM sees the
 * host GPU only with passthrough. Required → warning; optional acceleration → info (runs on CPU).
 */
const gpuRule: ValidationRule = {
  code: 'VAL_GPU',
  run(ctx) {
    const out: Issue[] = [];
    for (const app of Object.values(ctx.project.apps)) {
      const gpu = app.requirements.recommended.gpu ?? app.requirements.min.gpu;
      if (!gpu || (!gpu.required && gpu.features.length === 0)) continue;
      // Walk up to the device; a VM without GPU passthrough hides the host GPU.
      let hidden = false;
      let at: { type: string; id: string } | undefined = app.runsOn;
      for (let depth = 0; at && at.type === 'workload' && depth < 16; depth += 1) {
        const w: Workload | undefined = ctx.project.workloads[at.id];
        if (w?.kind === 'vm' && !w.passthrough?.gpu) hidden = true;
        at = w?.host;
      }
      const device = at?.type === 'device' ? ctx.project.devices[at.id] : undefined;
      if (!device) continue;
      const available = hidden ? [] : device.hardware.gpus.flatMap((g) => g.features);
      const ok =
        gpu.features.length === 0
          ? !hidden && device.hardware.gpus.length > 0
          : gpu.features.some((f) => available.includes(f));
      if (ok) continue;
      out.push(
        issue(
          gpu.required ? 'VAL_GPU' : 'VAL_GPU_OPTIONAL',
          gpu.required ? 'warning' : 'info',
          [{ type: 'app', id: app.id }],
          {
            app: app.name,
            host: device.name,
            features: gpu.features.join(', ') || 'GPU',
            behindVm: hidden ? 'yes' : 'no',
          },
        ),
      );
    }
    return out;
  },
};

/** VAL-14 required dependency without a provider. */
const dependencies: ValidationRule = {
  code: 'VAL_14',
  run(ctx) {
    const out: Issue[] = [];
    for (const app of Object.values(ctx.project.apps)) {
      for (const dep of app.dependencies) {
        if (dep.optional) continue;
        if (dep.satisfiedBy && ctx.project.apps[dep.satisfiedBy]) continue;
        out.push(
          issue('VAL_14', 'error', [{ type: 'app', id: app.id }], {
            app: app.name,
            capability: dep.capability,
          }),
        );
      }
    }
    return out;
  },
};

/** Rack placement (LOC-04): overlap, range, width, missing shelf. */
const rackRules: ValidationRule = {
  code: 'VAL_RACK',
  run(ctx) {
    const out: Issue[] = [];
    for (const device of Object.values(ctx.project.devices)) {
      const p = device.placement;
      const rack = p ? ctx.project.locations[p.locationId] : undefined;
      if (!p || rack?.kind !== 'rack' || p.u === undefined) continue;
      const fit = checkRackFit(ctx.project, device.id, rack.id, p.u);
      if (fit.ok) continue;
      const code =
        fit.code === 'RACK_UNITS_OCCUPIED'
          ? 'VAL_RACK_OVERLAP'
          : fit.code === 'RACK_UNIT_OUT_OF_RANGE'
            ? 'VAL_RACK_OUT_OF_RANGE'
            : fit.code === 'RACK_WIDTH'
              ? 'VAL_RACK_WIDTH'
              : fit.code === 'RACK_NO_SHELF'
                ? 'VAL_RACK_NO_SHELF'
                : undefined;
      if (code)
        out.push(
          issue(
            code,
            'error',
            [
              { type: 'device', id: device.id },
              { type: 'location', id: rack.id },
            ],
            { device: device.name, rack: rack.name, u: p.u },
          ),
        );
    }
    return out;
  },
};

/** References left behind on purpose by deletions (docs/02 cascade policy) are reported here. */
const brokenReferences: ValidationRule = {
  code: 'VAL_REF',
  run(ctx) {
    const out: Issue[] = [];
    const p = ctx.project;
    const exists = (type: string, id: string) =>
      ({ zone: p.zones, subnet: p.subnets, device: p.devices, workload: p.workloads, app: p.apps })[
        type
      ]?.[id] !== undefined;
    for (const device of Object.values(p.devices)) {
      device.firewall?.rules.forEach((rule, index) => {
        for (const end of [rule.source, rule.destination]) {
          if ('id' in end && !exists(end.type, end.id)) {
            out.push(
              issue(
                'VAL_REF_RULE',
                'warning',
                [
                  { type: 'device', id: device.id },
                  { type: 'rule', id: rule.id },
                ],
                { device: device.name, rule: index + 1 },
              ),
            );
          }
        }
      });
      for (const nat of device.firewall?.nat ?? []) {
        const iface = nat.kind === 'masquerade' ? nat.outInterfaceId : nat.inInterfaceId;
        const target =
          nat.kind === 'port-forward' && 'appId' in nat.target ? nat.target.appId : undefined;
        if (!p.interfaces[iface] || (target && !p.apps[target]))
          out.push(
            issue('VAL_REF_NAT', 'warning', [{ type: 'device', id: device.id }], {
              device: device.name,
            }),
          );
      }
    }
    for (const subnet of Object.values(p.subnets)) {
      for (const server of subnet.dns?.servers ?? []) {
        if (server.type === 'app' && !p.apps[server.id])
          out.push(
            issue('VAL_REF_DNS', 'warning', [{ type: 'subnet', id: subnet.id }], {
              subnet: subnet.cidr,
            }),
          );
      }
    }
    return out;
  },
};

export const rules: ValidationRule[] = [
  duplicateIp,
  ipOutsideSubnet,
  staticInDhcp,
  vlanMismatch,
  mediumMismatch,
  l2Loop,
  vlanSubnetGaps,
  portUsage,
  overlappingSubnets,
  portConflict,
  osCompatibility,
  archCompatibility,
  proxyAndDns,
  poolDisks,
  hardwareFit,
  ipv6Rules,
  bondRules,
  capacityRule,
  gpuRule,
  dependencies,
  rackRules,
  brokenReferences,
];

/** Issue codes produced by the rules — every one needs `issues.<code>` translations (checked in CI). */
export const ISSUE_CODES = [
  'VAL_ASSERT',
  'VAL_01',
  'VAL_02',
  'VAL_03',
  'VAL_04',
  'VAL_05',
  'VAL_05_SPEED',
  'VAL_06',
  'VAL_07_VLAN',
  'VAL_07_GATEWAY',
  'VAL_08',
  'VAL_08_ISOLATED',
  'VAL_09',
  'VAL_10',
  'VAL_11_HYPERVISOR',
  'VAL_11_DOCKER_PVE',
  'VAL_11_DOCKER_WIN',
  'VAL_11_NOT_COMPUTE',
  'VAL_ARCH',
  'VAL_ARCH_OS',
  'VAL_PROXY',
  'VAL_PROXY_DNS',
  'VAL_DNS_ADDRESS',
  'VAL_POOL',
  'VAL_BOND_PORTS',
  'VAL_BOND_PEER',
  'VAL_IPV6_MODE',
  'VAL_IPV6_PREFIX',
  'VAL_RAM_MAX',
  'VAL_RAM_SLOTS',
  'VAL_SLOTS',
  'VAL_12',
  'VAL_12_UPS',
  'VAL_13',
  'VAL_13_OVER',
  'VAL_14',
  'VAL_GPU',
  'VAL_GPU_OPTIONAL',
  'VAL_RACK_OVERLAP',
  'VAL_RACK_OUT_OF_RANGE',
  'VAL_RACK_WIDTH',
  'VAL_RACK_NO_SHELF',
  'VAL_REF_RULE',
  'VAL_REF_NAT',
  'VAL_REF_DNS',
] as const;
