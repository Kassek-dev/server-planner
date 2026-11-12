import { type Interface, type Link, subnetForAddress } from '@server-planner/model';
import ipaddr from 'ipaddr.js';
import type { EngineContext } from '../context';
import { peerOf } from '../context';

/**
 * Logical L2/L3 view of the project for the simulation (docs/01 § 8d, docs/03 § 5.3).
 * A segment key is a VLAN ID, or '' for untagged traffic outside any VLAN.
 */

export type SegmentKey = string;

/** VLANs a port sends untagged and tagged. */
interface PortProfile {
  untagged: string | undefined;
  tagged: Set<string> | 'all';
}

/** Where an entity sits on the network: an L3 interface on an L2 segment. */
export interface Attachment {
  /** Interface holding the address (vlan sub-interface, bridge, vNIC, port). */
  ifaceId: string;
  /** Interface where frames enter the L2 graph (parent of a vlan sub-interface). */
  l2IfaceId: string;
  segment: SegmentKey;
  ip?: string;
  subnetId?: string;
  zoneId?: string;
}

const SWITCHING_KINDS = new Set(['switch', 'access-point']);
const ROUTING_KINDS = new Set(['router', 'firewall']);

export function parseIp(value: string | undefined) {
  if (!value || !ipaddr.isValid(value)) return undefined;
  return ipaddr.parse(value);
}

export function ipInCidr(address: string | undefined, cidr: string): boolean {
  const ip = parseIp(address);
  if (!ip) return false;
  try {
    const net = ipaddr.parseCIDR(cidr);
    return ip.kind() === net[0].kind() && ip.match(net);
  } catch {
    return false;
  }
}

/** True when every address of `inner` lies inside `outer`. */
export function cidrWithin(inner: string, outer: string): boolean {
  try {
    const [network, prefix] = ipaddr.parseCIDR(inner);
    const [, outerPrefix] = ipaddr.parseCIDR(outer);
    return prefix >= outerPrefix && ipInCidr(network.toString(), outer);
  } catch {
    return false;
  }
}

const vlanOfTag = (ctx: EngineContext, tag: number | undefined) =>
  tag === undefined ? undefined : ctx.vlanByVid.get(tag)?.id;

function effectiveSwitchport(ctx: EngineContext, iface: Interface) {
  if (iface.switchport) return iface.switchport;
  const parent = iface.parentId ? ctx.project.interfaces[iface.parentId] : undefined;
  return parent?.kind === 'bridge' ? parent.switchport : undefined;
}

/** Subnet of the interface's first address (explicit, by address, or none). */
function addressSubnet(ctx: EngineContext, iface: Interface): string | undefined {
  for (const a of iface.addresses) {
    if (a.subnetId && ctx.project.subnets[a.subnetId]) return a.subnetId;
    const byAddress = a.address ? subnetForAddress(ctx.project, a.address) : undefined;
    if (byAddress) return byAddress;
  }
  return undefined;
}

export function portProfile(ctx: EngineContext, iface: Interface): PortProfile {
  const sp = effectiveSwitchport(ctx, iface);
  if (sp?.mode === 'access') return { untagged: sp.accessVlanId, tagged: new Set() };
  if (sp?.mode === 'trunk') {
    const tagged =
      sp.allowedVlanIds === undefined || sp.allowedVlanIds === 'all'
        ? 'all'
        : new Set(sp.allowedVlanIds);
    return { untagged: sp.nativeVlanId, tagged };
  }
  const tagged = new Set<string>();
  for (const child of ctx.interfacesByOwner.get(iface.owner.id) ?? []) {
    const vlan =
      child.kind === 'vlan' && child.parentId === iface.id && vlanOfTag(ctx, child.vlanTag);
    if (vlan) tagged.add(vlan);
  }
  const device = ctx.deviceOfInterface.get(iface.id);
  if (device?.kind === 'access-point' && iface.kind !== 'wifi-radio') {
    for (const ssid of device.wifi?.ssids ?? []) if (ssid.vlanId) tagged.add(ssid.vlanId);
  }
  const subnet = addressSubnet(ctx, iface);
  const untagged =
    iface.kind === 'vnic'
      ? (vlanOfTag(ctx, iface.vlanTag) ??
        (subnet ? ctx.project.subnets[subnet]?.vlanId : undefined))
      : subnet
        ? ctx.project.subnets[subnet]?.vlanId
        : undefined;
  return { untagged, tagged };
}

const has = (set: Set<string> | 'all', v: string) => v !== '' && (set === 'all' || set.has(v));

function ssidOf(ctx: EngineContext, link: Link) {
  if (!link.ssidId) return undefined;
  for (const end of [link.a, link.b]) {
    const ssid = ctx.deviceOfInterface.get(end)?.wifi?.ssids.find((s) => s.id === link.ssidId);
    if (ssid) return ssid;
  }
  return undefined;
}

/** Whether a link carries the segment, and which end refuses it otherwise. */
export function linkCarries(
  ctx: EngineContext,
  link: Link,
  segment: SegmentKey,
): { ok: true } | { ok: false; refusedBy?: string } {
  const a = ctx.project.interfaces[link.a];
  const b = ctx.project.interfaces[link.b];
  if (!a || !b || !a.enabled || !b.enabled) return { ok: false };
  const ssid = ssidOf(ctx, link);
  if (ssid?.vlanId) return segment === ssid.vlanId ? { ok: true } : { ok: false };
  const pa = portProfile(ctx, a);
  const pb = portProfile(ctx, b);
  if (has(pa.tagged, segment) && has(pb.tagged, segment)) return { ok: true };
  const conflict = pa.untagged && pb.untagged && pa.untagged !== pb.untagged;
  const untagged = pa.untagged ?? pb.untagged ?? '';
  if (!conflict && untagged === segment) return { ok: true };
  // Name the end that does not admit the segment (docs/01 SIM-01 "VLAN 30 not allowed on …").
  const admits = (p: PortProfile) => p.untagged === segment || has(p.tagged, segment);
  if (admits(pa) && !admits(pb)) return { ok: false, refusedBy: b.id };
  if (admits(pb) && !admits(pa)) return { ok: false, refusedBy: a.id };
  return { ok: false };
}

/** Interfaces of the same device that forward frames between each other. */
export function switchGroup(ctx: EngineContext, iface: Interface): Interface[] {
  const owner = ctx.interfacesByOwner.get(iface.owner.id) ?? [];
  if (iface.kind === 'bridge') return owner.filter((i) => i.parentId === iface.id);
  const parent = iface.parentId ? ctx.project.interfaces[iface.parentId] : undefined;
  if (parent?.kind === 'bridge')
    return [parent, ...owner.filter((i) => i.parentId === parent.id && i.id !== iface.id)];
  const device = iface.owner.type === 'device' ? ctx.project.devices[iface.owner.id] : undefined;
  if (!device || iface.kind === 'wan' || iface.kind === 'vlan') return [];
  if (SWITCHING_KINDS.has(device.kind))
    return owner.filter((i) => i.id !== iface.id && i.kind !== 'wan' && i.kind !== 'vlan');
  if (ROUTING_KINDS.has(device.kind) && iface.switchport)
    return owner.filter((i) => i.id !== iface.id && i.switchport);
  return [];
}

export interface L2Search {
  /** Interface → how it was reached (for the path). */
  reached: Map<string, { from?: string; linkId?: string }>;
  /** First link that refused the segment next to the reached area. */
  blocked?: { linkId: string; ifaceId?: string };
}

/** Breadth-first search over links carrying `segment`, through switching devices. */
export function searchL2(ctx: EngineContext, startIface: string, segment: SegmentKey): L2Search {
  const reached = new Map<string, { from?: string; linkId?: string }>([[startIface, {}]]);
  const queue = [startIface];
  let blocked: L2Search['blocked'];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const iface = ctx.project.interfaces[id];
    if (!iface) continue;
    for (const member of switchGroup(ctx, iface)) {
      if (reached.has(member.id)) continue;
      reached.set(member.id, { from: id });
      queue.push(member.id);
    }
    for (const link of ctx.linksByInterface.get(id) ?? []) {
      const peer = peerOf(link, id);
      if (reached.has(peer)) continue;
      const carries = linkCarries(ctx, link, segment);
      if (!carries.ok) {
        if (!blocked && carries.refusedBy)
          blocked = { linkId: link.id, ifaceId: carries.refusedBy };
        continue;
      }
      reached.set(peer, { from: id, linkId: link.id });
      queue.push(peer);
    }
  }
  return blocked ? { reached, blocked } : { reached };
}

/** Links and interfaces from the search start to `target`. */
export function l2Path(search: L2Search, target: string): { links: string[]; ifaces: string[] } {
  const links: string[] = [];
  const ifaces: string[] = [];
  let current: string | undefined = target;
  for (let guard = 0; current && guard < 10_000; guard += 1) {
    ifaces.push(current);
    const step = search.reached.get(current);
    if (step?.linkId) links.push(step.linkId);
    current = step?.from;
  }
  return { links: links.reverse(), ifaces: ifaces.reverse() };
}

/** Segment of a plain port: wifi SSID VLAN, else what the neighbour sends untagged. */
function neighbourSegment(ctx: EngineContext, iface: Interface): SegmentKey | undefined {
  for (const link of ctx.linksByInterface.get(iface.id) ?? []) {
    const ssid = ssidOf(ctx, link);
    if (ssid) return ssid.vlanId ?? '';
    const peer = ctx.project.interfaces[peerOf(link, iface.id)];
    if (peer) return portProfile(ctx, peer).untagged ?? '';
  }
  return undefined;
}

/** L3 attachment of one interface, or undefined when it cannot carry IP. */
export function attachmentOf(ctx: EngineContext, iface: Interface): Attachment | undefined {
  if (!iface.enabled) return undefined;
  const p = ctx.project;
  const address = iface.addresses.find((a) => a.address)?.address;
  let subnetId = addressSubnet(ctx, iface);
  let l2IfaceId = iface.id;
  let segment: SegmentKey | undefined;
  if (iface.kind === 'vlan') {
    if (!iface.parentId) return undefined;
    l2IfaceId = iface.parentId;
    segment = vlanOfTag(ctx, iface.vlanTag) ?? '';
  } else if (iface.kind === 'vnic') {
    segment = vlanOfTag(ctx, iface.vlanTag);
  } else if (iface.kind === 'bridge') {
    const sp = iface.switchport;
    segment = sp?.mode === 'access' ? sp.accessVlanId : sp?.nativeVlanId;
  }
  segment ??= (subnetId ? p.subnets[subnetId]?.vlanId : undefined) ?? neighbourSegment(ctx, iface);
  if (segment === undefined) {
    if (iface.addresses.length === 0) return undefined;
    segment = '';
  }
  // DHCP / unaddressed clients take the subnet of their segment.
  subnetId ??= Object.values(p.subnets).find((s) => (s.vlanId ?? '') === segment)?.id;
  const zoneId = iface.zoneId ?? (subnetId ? p.subnets[subnetId]?.zoneId : undefined);
  return {
    ifaceId: iface.id,
    l2IfaceId,
    segment,
    ...(address ? { ip: address } : {}),
    ...(subnetId ? { subnetId } : {}),
    ...(zoneId ? { zoneId } : {}),
  };
}

const PHYSICAL = new Set(['rj45', 'sfp', 'sfp+', 'sfp28', 'qsfp+', 'wifi-radio', 'bond']);

/** Candidate L3 interfaces of a device or VM/LXC. */
export function ownerAttachments(ctx: EngineContext, ownerId: string): Attachment[] {
  const owned = ctx.interfacesByOwner.get(ownerId) ?? [];
  const device = ctx.project.devices[ownerId];
  const infra = device && (SWITCHING_KINDS.has(device.kind) || device.kind === 'internet');
  const out: Attachment[] = [];
  for (const iface of owned) {
    if (iface.kind === 'wan' && device?.kind === 'internet') continue;
    const parent = iface.parentId ? ctx.project.interfaces[iface.parentId] : undefined;
    const addressed = iface.addresses.length > 0;
    const plainPort =
      !infra &&
      PHYSICAL.has(iface.kind) &&
      parent?.kind !== 'bridge' &&
      (ctx.linksByInterface.get(iface.id)?.length ?? 0) > 0 &&
      !owned.some((c) => c.parentId === iface.id);
    if (!addressed && !plainPort && iface.kind !== 'vnic') continue;
    const attachment = attachmentOf(ctx, iface);
    if (attachment) out.push(attachment);
  }
  // Addressed interfaces first: they are what other hosts talk to.
  return out.sort((a, b) => Number(!a.ip) - Number(!b.ip));
}
