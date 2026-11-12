import type {
  AppInstance,
  Device,
  Endpoint,
  FirewallRule,
  Interface,
  Protocol,
  Workload,
} from '@server-planner/model';
import type { EngineContext } from '../context';
import type { EntityRef, IssueFix } from '../types';
import {
  type Attachment,
  attachmentOf,
  cidrWithin,
  ipInCidr,
  type L2Search,
  l2Path,
  ownerAttachments,
  type SegmentKey,
  searchL2,
} from './network';

/** Reachability A → B (SIM-01) — docs/01 § 8d, docs/03 § 5.3. Pure; returns codes, never text. */

export type SimLayer = 'dns' | 'l2' | 'l3' | 'firewall' | 'nat' | 'docker' | 'app';

export interface SimStep {
  ref: EntityRef;
  layer: SimLayer;
  decision: 'pass' | 'fail';
  /** Translation key under `simulation:steps.<code>`, e.g. `SIM_FW_RULE_DENY`. */
  code: string;
  params: Record<string, string | number>;
  ruleRef?: EntityRef;
}

/** Every step code `reach()` can emit (each needs `simulation:steps.<code>`). */
export const SIM_CODES = [
  'SIM_APP_LISTENING',
  'SIM_APP_NOT_LISTENING',
  'SIM_DOCKER_INTERNAL',
  'SIM_DOCKER_NAT',
  'SIM_DOCKER_NOT_PUBLISHED',
  'SIM_DOCKER_PUBLISHED',
  'SIM_DST_NO_NETWORK',
  'SIM_FW_DEFAULT_ALLOW',
  'SIM_FW_DEFAULT_DENY',
  'SIM_FW_INTRA_ZONE_ALLOW',
  'SIM_FW_INTRA_ZONE_DENY',
  'SIM_FW_RULE_ALLOW',
  'SIM_FW_RULE_DENY',
  'SIM_INTERNET',
  'SIM_L2_NO_PATH',
  'SIM_L2_OTHER_SEGMENT',
  'SIM_L2_SAME_SEGMENT',
  'SIM_L2_TO_GATEWAY',
  'SIM_L2_TO_TARGET',
  'SIM_L2_VLAN_NOT_ALLOWED',
  'SIM_L3_NEXT_HOP_UNSUPPORTED',
  'SIM_L3_NO_GATEWAY',
  'SIM_L3_NO_ROUTE',
  'SIM_L3_NO_SUBNET',
  'SIM_L3_NO_WAN',
  'SIM_L3_ROUTE',
  'SIM_L3_ROUTE_INTERNET',
  'SIM_LOCAL',
  'SIM_NAT_MASQUERADE',
  'SIM_NAT_MISSING',
  'SIM_SRC_NO_NETWORK',
  'SIM_WAN_NO_UPLINK',
  'SIM_FLOW_UNBOUND',
  'SIM_FROM_INTERNET',
] as const;

export interface ReachQuery {
  from: EntityRef;
  to: EntityRef | 'internet';
  protocol: Protocol;
  port?: number;
}

export interface ReachabilityResult {
  verdict: 'reachable' | 'blocked' | 'unknown';
  steps: SimStep[];
  /** Index of the failing step. */
  blockedAt?: number;
  /** Devices and links the traffic crosses, for highlighting on the canvas. */
  path: { devices: string[]; links: string[] };
  /** Suggested change when a firewall blocks the traffic (docs/05 § 7, D-08). */
  fix?: IssueFix;
}

/** What firewall endpoints can match on one side of a connection. */
interface Side {
  internet: boolean;
  zoneId?: string;
  subnetId?: string;
  ip?: string;
  devices: Set<string>;
  workloads: Set<string>;
  apps: Set<string>;
}

interface Endpoint_ {
  attachments: Attachment[];
  /** Container on a Docker bridge network (traffic is NATed through its host). */
  bridged?: { container: Workload & { kind: 'container' }; networkId: string; internal: boolean };
  container?: Workload & { kind: 'container' };
  app?: AppInstance;
  workloads: Set<string>;
  apps: Set<string>;
}

const segmentName = (ctx: EngineContext, segment: SegmentKey) => {
  const vlan = ctx.project.vlans[segment];
  return vlan ? `${vlan.vid} (${vlan.name})` : 'untagged';
};

function resolve(ctx: EngineContext, ref: EntityRef, depth = 0): Endpoint_ {
  const p = ctx.project;
  const empty: Endpoint_ = { attachments: [], workloads: new Set(), apps: new Set() };
  if (depth > 16) return empty;
  switch (ref.type) {
    case 'device':
      return p.devices[ref.id] ? { ...empty, attachments: ownerAttachments(ctx, ref.id) } : empty;
    case 'interface': {
      const iface = p.interfaces[ref.id];
      const att = iface ? attachmentOf(ctx, iface) : undefined;
      return { ...empty, attachments: att ? [att] : [] };
    }
    case 'app': {
      const app = p.apps[ref.id];
      if (!app) return empty;
      const host = resolve(ctx, app.runsOn, depth + 1);
      return { ...host, app, apps: new Set([...host.apps, app.id]) };
    }
    case 'workload': {
      const w = p.workloads[ref.id];
      if (!w) return empty;
      if (w.kind !== 'container') {
        return { ...empty, attachments: ownerAttachments(ctx, w.id), workloads: new Set([w.id]) };
      }
      const withSelf = (e: Endpoint_): Endpoint_ => ({
        ...e,
        container: w,
        workloads: new Set([...e.workloads, w.id]),
      });
      if (w.network.mode === 'none') return withSelf(empty);
      const host = resolve(ctx, w.host, depth + 1);
      if (w.network.mode === 'host') return withSelf(host);
      const net = p.dockerNetworks[w.network.dockerNetworkId];
      if (!net) return withSelf(empty);
      if (net.driver === 'bridge') {
        return withSelf({
          ...host,
          bridged: { container: w, networkId: net.id, internal: !!net.internal },
        });
      }
      // macvlan / ipvlan: the container has its own address on the parent's segment.
      const parent = net.parentInterfaceId ? p.interfaces[net.parentInterfaceId] : undefined;
      const att = parent ? attachmentOf(ctx, parent) : undefined;
      const ip = w.network.ip;
      return withSelf({
        ...empty,
        attachments: att ? [{ ...att, ...(ip ? { ip } : {}) }] : [],
      });
    }
    default:
      return empty;
  }
}

function sideOf(ctx: EngineContext, e: Endpoint_, att: Attachment): Side {
  const iface = ctx.project.interfaces[att.ifaceId];
  const devices = new Set<string>();
  const workloads = new Set(e.workloads);
  if (iface?.owner.type === 'device') devices.add(iface.owner.id);
  if (iface?.owner.type === 'workload') workloads.add(iface.owner.id);
  return {
    internet: false,
    ...(att.zoneId ? { zoneId: att.zoneId } : {}),
    ...(att.subnetId ? { subnetId: att.subnetId } : {}),
    ...(att.ip ? { ip: att.ip } : {}),
    devices,
    workloads,
    apps: e.apps,
  };
}

function endpointMatches(ctx: EngineContext, endpoint: Endpoint, side: Side): boolean {
  switch (endpoint.type) {
    case 'any':
      return true;
    case 'internet':
      return side.internet;
    case 'zone':
      return side.zoneId === endpoint.id;
    case 'subnet':
      return side.subnetId === endpoint.id;
    case 'device':
      return side.devices.has(endpoint.id);
    case 'workload':
      return side.workloads.has(endpoint.id);
    case 'app':
      return side.apps.has(endpoint.id);
    case 'cidr': {
      if (side.ip) return ipInCidr(side.ip, endpoint.value);
      const subnet = side.subnetId ? ctx.project.subnets[side.subnetId] : undefined;
      return !!subnet && cidrWithin(subnet.cidr, endpoint.value);
    }
  }
}

function ruleMatches(
  ctx: EngineContext,
  rule: FirewallRule,
  src: Side,
  dst: Side,
  q: ReachQuery,
): boolean {
  if (!rule.enabled) return false;
  if (rule.protocol !== 'any' && rule.protocol !== q.protocol) return false;
  if (rule.ports && rule.ports.length > 0) {
    const port = q.port;
    if (port === undefined || !rule.ports.some((r) => port >= r.from && port <= r.to)) return false;
  }
  return endpointMatches(ctx, rule.source, src) && endpointMatches(ctx, rule.destination, dst);
}

class Trace {
  steps: SimStep[] = [];
  devices = new Set<string>();
  links = new Set<string>();
  fix: IssueFix | undefined;
  unknown = false;
  /** Target device, on the path only when reached. */
  target: string | undefined;
  constructor(private ctx: EngineContext) {}
  pass(
    layer: SimLayer,
    ref: EntityRef,
    code: string,
    params: SimStep['params'] = {},
    rule?: string,
  ) {
    this.steps.push({
      ref,
      layer,
      decision: 'pass',
      code,
      params,
      ...(rule ? { ruleRef: { type: 'rule', id: rule } } : {}),
    });
  }
  fail(
    layer: SimLayer,
    ref: EntityRef,
    code: string,
    params: SimStep['params'] = {},
    rule?: string,
  ) {
    this.steps.push({
      ref,
      layer,
      decision: 'fail',
      code,
      params,
      ...(rule ? { ruleRef: { type: 'rule', id: rule } } : {}),
    });
    return false;
  }
  addPath(search: L2Search, target: string) {
    const { links, ifaces } = l2Path(search, target);
    for (const id of links) this.links.add(id);
    for (const id of ifaces) {
      const device = this.ctx.deviceOfInterface.get(id);
      if (device) this.devices.add(device.id);
    }
  }
  result(): ReachabilityResult {
    const blockedAt = this.steps.findIndex((s) => s.decision === 'fail');
    if (blockedAt < 0 && this.target) this.devices.add(this.target);
    return {
      verdict: blockedAt >= 0 ? (this.unknown ? 'unknown' : 'blocked') : 'reachable',
      steps: this.steps,
      ...(blockedAt >= 0 ? { blockedAt } : {}),
      path: { devices: [...this.devices], links: [...this.links] },
      ...(this.fix ? { fix: this.fix } : {}),
    };
  }
}

const ifaceRef = (id: string): EntityRef => ({ type: 'interface', id });
const deviceRef = (device: Device): EntityRef => ({ type: 'device', id: device.id });

/** L2 hop inside one segment; on failure names the port refusing the VLAN. */
function l2Hop(
  ctx: EngineContext,
  t: Trace,
  from: Attachment,
  to: { l2IfaceId: string; segment: SegmentKey },
  code: string,
  params: SimStep['params'],
): boolean {
  const segment = segmentName(ctx, from.segment);
  if (from.segment !== to.segment)
    return t.fail('l2', ifaceRef(from.ifaceId), 'SIM_L2_OTHER_SEGMENT', { ...params, segment });
  const search = searchL2(ctx, from.l2IfaceId, from.segment);
  if (search.reached.has(to.l2IfaceId)) {
    t.addPath(search, to.l2IfaceId);
    t.pass('l2', ifaceRef(from.ifaceId), code, { ...params, segment });
    return true;
  }
  const refused = search.blocked?.ifaceId
    ? ctx.project.interfaces[search.blocked.ifaceId]
    : undefined;
  if (refused && search.blocked) {
    t.addPath(search, peerInside(ctx, search, search.blocked.linkId));
    t.links.add(search.blocked.linkId);
    const device = ctx.deviceOfInterface.get(refused.id);
    return t.fail('l2', ifaceRef(refused.id), 'SIM_L2_VLAN_NOT_ALLOWED', {
      ...params,
      segment,
      interface: refused.name,
      device: device?.name ?? '',
    });
  }
  return t.fail('l2', ifaceRef(from.ifaceId), 'SIM_L2_NO_PATH', { ...params, segment });
}

/** End of a blocked link that the search did reach. */
function peerInside(ctx: EngineContext, search: L2Search, linkId: string): string {
  const link = ctx.project.links[linkId];
  if (!link) return '';
  return search.reached.has(link.a) ? link.a : link.b;
}

function findInterfaceByIp(ctx: EngineContext, ip: string): Interface | undefined {
  return Object.values(ctx.project.interfaces).find((i) =>
    i.addresses.some((a) => a.address === ip),
  );
}

const isWan = (ctx: EngineContext, iface: Interface) =>
  iface.kind === 'wan' || (iface.zoneId && ctx.project.zones[iface.zoneId]?.kind === 'wan');

function destinationEndpoint(q: ReachQuery, dst: Side | undefined): Endpoint | undefined {
  if (q.to === 'internet') return { type: 'internet' };
  if (q.to.type === 'app' || q.to.type === 'workload' || q.to.type === 'device')
    return { type: q.to.type, id: q.to.id };
  return dst?.zoneId ? { type: 'zone', id: dst.zoneId } : undefined;
}

function firewall(
  ctx: EngineContext,
  t: Trace,
  router: Device,
  src: Side,
  dst: Side,
  q: ReachQuery,
): boolean {
  const fw = router.firewall;
  if (!fw) return true;
  const ref = deviceRef(router);
  const zone = (id?: string) => (id ? (ctx.project.zones[id]?.name ?? id) : '');
  const params = { router: router.name, from: zone(src.zoneId), to: zone(dst.zoneId) };
  if (src.zoneId && src.zoneId === dst.zoneId && !dst.internet) {
    const z = ctx.project.zones[src.zoneId];
    if (z?.intraZone === 'deny') return t.fail('firewall', ref, 'SIM_FW_INTRA_ZONE_DENY', params);
    t.pass('firewall', ref, 'SIM_FW_INTRA_ZONE_ALLOW', params);
    return true;
  }
  const index = fw.rules.findIndex((rule) => ruleMatches(ctx, rule, src, dst, q));
  const rule = fw.rules[index];
  if (rule?.action === 'allow') {
    t.pass('firewall', ref, 'SIM_FW_RULE_ALLOW', { ...params, rule: index + 1 }, rule.id);
    return true;
  }
  if (!rule && fw.defaultAction === 'allow') {
    t.pass('firewall', ref, 'SIM_FW_DEFAULT_ALLOW', params);
    return true;
  }
  // Suggest an allow rule just above the blocking one (docs/05 § 7 "Suggest fix").
  const destination = destinationEndpoint(q, dst);
  if (src.zoneId && destination) {
    t.fix = {
      command: 'firewall.addRule',
      payload: {
        deviceId: router.id,
        index: rule ? index : fw.rules.length,
        rule: {
          enabled: true,
          action: 'allow',
          protocol: q.protocol,
          source: { type: 'zone', id: src.zoneId },
          destination,
          ...(q.port !== undefined && q.protocol !== 'icmp'
            ? { ports: [{ from: q.port, to: q.port }] }
            : {}),
        },
      },
    };
  }
  return rule
    ? t.fail('firewall', ref, 'SIM_FW_RULE_DENY', { ...params, rule: index + 1 }, rule.id)
    : t.fail('firewall', ref, 'SIM_FW_DEFAULT_DENY', params);
}

/** Docker publishing and the app listener on the target (layers docker/app). */
function targetChecks(t: Trace, dst: Endpoint_, q: ReachQuery, local: boolean) {
  if (q.port === undefined || (q.protocol !== 'tcp' && q.protocol !== 'udp')) return true;
  let port = q.port;
  if (dst.bridged && !local) {
    const c = dst.bridged.container;
    const mapping = c.portMappings.find((m) => m.hostPort === port && m.protocol === q.protocol);
    const ref: EntityRef = { type: 'workload', id: c.id };
    if (!mapping)
      return t.fail('docker', ref, 'SIM_DOCKER_NOT_PUBLISHED', {
        container: c.name,
        port,
        protocol: q.protocol,
      });
    t.pass('docker', ref, 'SIM_DOCKER_PUBLISHED', {
      container: c.name,
      hostPort: mapping.hostPort,
      containerPort: mapping.containerPort,
      protocol: q.protocol,
    });
    port = mapping.containerPort;
  }
  if (dst.app) {
    const ref: EntityRef = { type: 'app', id: dst.app.id };
    const listening = dst.app.listeners.some((l) => l.port === port && l.protocol === q.protocol);
    const params = { app: dst.app.name, port, protocol: q.protocol };
    if (!listening) return t.fail('app', ref, 'SIM_APP_NOT_LISTENING', params);
    t.pass('app', ref, 'SIM_APP_LISTENING', params);
  }
  return true;
}

function attempt(
  ctx: EngineContext,
  q: ReachQuery,
  src: Endpoint_,
  srcAtt: Attachment,
  dst: Endpoint_ | undefined,
  dstAtt: Attachment | undefined,
): ReachabilityResult {
  const p = ctx.project;
  const t = new Trace(ctx);
  const srcSide = sideOf(ctx, src, srcAtt);
  const srcDevice = ctx.deviceOfInterface.get(srcAtt.ifaceId);
  if (srcDevice) t.devices.add(srcDevice.id);
  const dstDevice = dstAtt ? ctx.deviceOfInterface.get(dstAtt.ifaceId) : undefined;
  if (dstDevice) t.target = dstDevice.id;

  const sameBridge =
    !!src.bridged && !!dst?.bridged && src.bridged.networkId === dst.bridged.networkId;
  if (src.bridged) {
    const ref: EntityRef = { type: 'workload', id: src.bridged.container.id };
    const network = p.dockerNetworks[src.bridged.networkId]?.name ?? '';
    if (src.bridged.internal && !sameBridge) {
      t.fail('docker', ref, 'SIM_DOCKER_INTERNAL', { network });
      return t.result();
    }
    if (!sameBridge) t.pass('docker', ref, 'SIM_DOCKER_NAT', { network });
  }

  // Same host / same address: no network hop.
  if (dst && dstAtt && dstAtt.ifaceId === srcAtt.ifaceId) {
    t.pass('l3', ifaceRef(srcAtt.ifaceId), 'SIM_LOCAL', {});
    targetChecks(t, dst, q, sameBridge);
    return t.result();
  }

  const srcSubnet = srcAtt.subnetId ? p.subnets[srcAtt.subnetId] : undefined;
  if (!srcSubnet) {
    t.fail('l3', ifaceRef(srcAtt.ifaceId), 'SIM_L3_NO_SUBNET', {});
    return t.result();
  }

  if (dst && dstAtt && dstAtt.subnetId === srcSubnet.id) {
    if (l2Hop(ctx, t, srcAtt, dstAtt, 'SIM_L2_SAME_SEGMENT', { subnet: srcSubnet.cidr }))
      targetChecks(t, dst, q, false);
    return t.result();
  }

  // Routed: L2 to the gateway, route, firewall, NAT, L2 to the target.
  const gwIface = srcSubnet.gateway ? findInterfaceByIp(ctx, srcSubnet.gateway) : undefined;
  const gwAtt = gwIface ? attachmentOf(ctx, gwIface) : undefined;
  const router = gwIface ? ctx.deviceOfInterface.get(gwIface.id) : undefined;
  if (!gwIface || !gwAtt || !router) {
    t.fail('l3', { type: 'subnet', id: srcSubnet.id }, 'SIM_L3_NO_GATEWAY', {
      subnet: srcSubnet.cidr,
    });
    return t.result();
  }
  t.devices.add(router.id);
  if (!l2Hop(ctx, t, srcAtt, gwAtt, 'SIM_L2_TO_GATEWAY', { gateway: srcSubnet.gateway ?? '' }))
    return t.result();

  const routerIfaces = ctx.interfacesByOwner.get(router.id) ?? [];
  const routerRef = deviceRef(router);
  if (q.to === 'internet' || !dst || !dstAtt) {
    const masquerade = router.firewall?.nat.filter((n) => n.kind === 'masquerade') ?? [];
    const wans = routerIfaces.filter((i) => isWan(ctx, i) && i.enabled);
    const wan = wans.find((i) => masquerade.some((m) => m.outInterfaceId === i.id)) ?? wans[0];
    if (!wan) {
      t.fail('l3', routerRef, 'SIM_L3_NO_WAN', { router: router.name });
      return t.result();
    }
    t.pass('l3', routerRef, 'SIM_L3_ROUTE_INTERNET', { router: router.name, from: srcSubnet.cidr });
    const wanZone = wan.zoneId ?? Object.values(p.zones).find((z) => z.kind === 'wan')?.id;
    const dstSide: Side = {
      internet: true,
      ...(wanZone ? { zoneId: wanZone } : {}),
      devices: new Set(),
      workloads: new Set(),
      apps: new Set(),
    };
    if (!firewall(ctx, t, router, srcSide, dstSide, q)) return t.result();
    const nat = masquerade.find(
      (m) =>
        m.outInterfaceId === wan.id &&
        (!m.sourceZoneIds?.length || (srcSide.zoneId && m.sourceZoneIds.includes(srcSide.zoneId))),
    );
    if (!nat) {
      t.fail('nat', routerRef, 'SIM_NAT_MISSING', { router: router.name, interface: wan.name });
      return t.result();
    }
    t.pass('nat', routerRef, 'SIM_NAT_MASQUERADE', { router: router.name, interface: wan.name });
    const uplink = (ctx.linksByInterface.get(wan.id) ?? []).find((l) => {
      const peer = ctx.deviceOfInterface.get(l.a === wan.id ? l.b : l.a);
      return peer?.kind === 'internet';
    });
    if (!uplink) {
      t.fail('l3', ifaceRef(wan.id), 'SIM_WAN_NO_UPLINK', { interface: wan.name });
      return t.result();
    }
    t.links.add(uplink.id);
    const internet = ctx.deviceOfInterface.get(uplink.a === wan.id ? uplink.b : uplink.a);
    if (internet) t.devices.add(internet.id);
    t.pass('l3', ifaceRef(wan.id), 'SIM_INTERNET', { interface: wan.name });
    return t.result();
  }

  const dstSubnet = dstAtt.subnetId ? p.subnets[dstAtt.subnetId] : undefined;
  let egress = routerIfaces
    .map((i) => attachmentOf(ctx, i))
    .find((a): a is Attachment => !!a && !!a.subnetId && a.subnetId === dstAtt.subnetId);
  if (!egress) {
    const route = Object.values(p.routes).find(
      (r) =>
        r.deviceId === router.id &&
        (ipInCidr(dstAtt.ip, r.destination) ||
          (!!dstSubnet && cidrWithin(dstSubnet.cidr, r.destination))),
    );
    const routeIface = route?.interfaceId ? p.interfaces[route.interfaceId] : undefined;
    const routeAtt = routeIface ? attachmentOf(ctx, routeIface) : undefined;
    if (route && routeAtt && !route.via) egress = routeAtt;
    else if (route) {
      t.unknown = true;
      t.fail('l3', routerRef, 'SIM_L3_NEXT_HOP_UNSUPPORTED', {
        router: router.name,
        via: route.via ?? '',
      });
      return t.result();
    }
  }
  if (!egress) {
    t.fail('l3', routerRef, 'SIM_L3_NO_ROUTE', {
      router: router.name,
      to: dstSubnet?.cidr ?? dstAtt.ip ?? '',
    });
    return t.result();
  }
  t.pass('l3', routerRef, 'SIM_L3_ROUTE', {
    router: router.name,
    from: srcSubnet.cidr,
    to: dstSubnet?.cidr ?? '',
  });
  if (!firewall(ctx, t, router, srcSide, sideOf(ctx, dst, dstAtt), q)) return t.result();
  if (!l2Hop(ctx, t, egress, dstAtt, 'SIM_L2_TO_TARGET', { subnet: dstSubnet?.cidr ?? '' }))
    return t.result();
  targetChecks(t, dst, q, false);
  return t.result();
}

const passed = (r: ReachabilityResult) => r.steps.filter((s) => s.decision === 'pass').length;

/** Reachability of `q.to` from `q.from`; tries every address pair and keeps the best outcome. */
/** Subnet of the first network attachment of an endpoint (for its DNS server). */
export function subnetOf(ctx: EngineContext, ref: EntityRef): string | undefined {
  return resolve(ctx, ref).attachments.find((a) => a.subnetId)?.subnetId;
}

export function reach(ctx: EngineContext, q: ReachQuery): ReachabilityResult {
  const src = resolve(ctx, q.from);
  const empty = (code: string, ref: EntityRef): ReachabilityResult => ({
    verdict: 'unknown',
    steps: [{ ref, layer: 'l3', decision: 'fail', code, params: {} }],
    blockedAt: 0,
    path: { devices: [], links: [] },
  });
  if (src.attachments.length === 0) return empty('SIM_SRC_NO_NETWORK', q.from);
  const dst = q.to === 'internet' ? undefined : resolve(ctx, q.to);
  if (dst && q.to !== 'internet' && dst.attachments.length === 0)
    return empty('SIM_DST_NO_NETWORK', q.to);

  let best: ReachabilityResult | undefined;
  for (const srcAtt of src.attachments) {
    for (const dstAtt of dst ? dst.attachments : [undefined]) {
      const result = attempt(ctx, q, src, srcAtt, dst, dstAtt);
      if (result.verdict === 'reachable') return result;
      if (!best || passed(result) > passed(best)) best = result;
    }
  }
  return best as ReachabilityResult;
}
