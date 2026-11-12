import type { FirewallRule, Interface } from '../schema/network';
import type { Project } from '../schema/project';
import { CommandError, defineCommand, getOrThrow } from './core';

/**
 * NET-10 "Typical segmentation": Mgmt / LAN / IoT / Guest as VLANs with a /24 each, a zone per
 * segment, gateway sub-interfaces on the router's trunk, basic firewall rules and masquerade.
 */

export const SEGMENTS = ['mgmt', 'lan', 'iot', 'guest'] as const;
export type SegmentKey = (typeof SEGMENTS)[number];

interface SegmentPreset {
  vid: number;
  name: string;
  color: 'violet' | 'sky' | 'pink' | 'lime';
  /** Clients get addresses from DHCP (`.100`–`.199`); management stays static. */
  dhcp: boolean;
  /** Guests do not see each other. */
  intraZone: 'allow' | 'deny';
  /** Everything (trusted) or the internet only. */
  reach: 'any' | 'internet';
}

export const SEGMENT_PRESETS: Record<SegmentKey, SegmentPreset> = {
  mgmt: { vid: 10, name: 'Mgmt', color: 'violet', dhcp: false, intraZone: 'allow', reach: 'any' },
  lan: { vid: 20, name: 'LAN', color: 'sky', dhcp: true, intraZone: 'allow', reach: 'any' },
  iot: { vid: 30, name: 'IoT', color: 'pink', dhcp: true, intraZone: 'allow', reach: 'internet' },
  guest: {
    vid: 40,
    name: 'Guest',
    color: 'lime',
    dhcp: true,
    intraZone: 'deny',
    reach: 'internet',
  },
};

const cidrOf = (vid: number) => `192.168.${vid}.0/24`;

export interface SegmentationPlan {
  /** Router ports that can carry the VLANs (physical, not WAN). */
  trunks: Interface[];
  /** Segments whose VLAN ID and subnet are still free. */
  available: SegmentKey[];
  hasWan: boolean;
}

/** What the wizard can offer for a router (pure, for the UI). */
export function planSegmentation(project: Project, routerId: string): SegmentationPlan {
  const own = Object.values(project.interfaces).filter((i) => i.owner.id === routerId);
  const vids = new Set(Object.values(project.vlans).map((v) => v.vid));
  const cidrs = new Set(Object.values(project.subnets).map((s) => s.cidr));
  return {
    trunks: own.filter((i) => !['wan', 'vlan', 'bridge', 'vnic', 'wifi-radio'].includes(i.kind)),
    available: SEGMENTS.filter((k) => {
      const { vid } = SEGMENT_PRESETS[k];
      return !vids.has(vid) && !cidrs.has(cidrOf(vid));
    }),
    hasWan: own.some((i) => i.kind === 'wan'),
  };
}

export const applySegmentation = defineCommand(
  'network.applySegmentation',
  (
    draft,
    {
      routerId,
      trunkInterfaceId,
      segments,
    }: { routerId: string; trunkInterfaceId: string; segments: SegmentKey[] },
    ctx,
  ): { zoneIds: string[] } => {
    const router = getOrThrow(draft.devices, routerId, 'device');
    const trunk = getOrThrow(draft.interfaces, trunkInterfaceId, 'interface');
    if (trunk.owner.id !== routerId)
      throw new CommandError('INTERFACE_NOT_ON_DEVICE', { id: trunkInterfaceId });
    const plan = planSegmentation(draft, routerId);
    for (const key of segments)
      if (!plan.available.includes(key))
        throw new CommandError('VLAN_VID_TAKEN', { vid: SEGMENT_PRESETS[key].vid });

    router.firewall ??= { defaultAction: 'deny', rules: [], nat: [], stateful: true };
    const firewall = router.firewall;
    const wan = Object.values(draft.interfaces).find(
      (i) => i.owner.id === routerId && i.kind === 'wan',
    );
    if (wan && !wan.zoneId) {
      const existing = Object.values(draft.zones).find((z) => z.kind === 'wan');
      const wanZone = existing?.id ?? ctx.createId('zone');
      if (!existing)
        draft.zones[wanZone] = {
          id: wanZone,
          name: 'WAN',
          kind: 'wan',
          color: 'sand',
          intraZone: 'deny',
        };
      wan.zoneId = wanZone;
    }

    const zoneIds: string[] = [];
    const vlanIds: string[] = [];
    const rules: Omit<FirewallRule, 'id'>[] = [];
    for (const key of SEGMENTS.filter((k) => segments.includes(k))) {
      const preset = SEGMENT_PRESETS[key];
      const vlanId = ctx.createId('vlan');
      draft.vlans[vlanId] = { id: vlanId, vid: preset.vid, name: preset.name, color: preset.color };
      const zoneId = ctx.createId('zone');
      draft.zones[zoneId] = {
        id: zoneId,
        name: preset.name,
        kind: 'internal',
        color: preset.color,
        intraZone: preset.intraZone,
      };
      const prefix = `192.168.${preset.vid}`;
      const subnetId = ctx.createId('subnet');
      draft.subnets[subnetId] = {
        id: subnetId,
        cidr: cidrOf(preset.vid),
        vlanId,
        zoneId,
        gateway: `${prefix}.1`,
        ...(preset.dhcp
          ? { dhcp: { enabled: true, rangeStart: `${prefix}.100`, rangeEnd: `${prefix}.199` } }
          : {}),
      };
      const ifaceId = ctx.createId('interface');
      draft.interfaces[ifaceId] = {
        id: ifaceId,
        owner: { type: 'device', id: routerId },
        name: `${trunk.name}.${preset.vid}`,
        kind: 'vlan',
        parentId: trunk.id,
        vlanTag: preset.vid,
        addresses: [{ mode: 'static', address: `${prefix}.1`, subnetId }],
        zoneId,
        enabled: true,
      };
      rules.push({
        enabled: true,
        action: 'allow',
        protocol: 'any',
        source: { type: 'zone', id: zoneId },
        destination: preset.reach === 'any' ? { type: 'any' } : { type: 'internet' },
        description: preset.reach === 'any' ? `${preset.name} → any` : `${preset.name} → Internet`,
      });
      zoneIds.push(zoneId);
      vlanIds.push(vlanId);
    }

    // Tag the new VLANs on the router port; an untagged port becomes a trunk.
    const sp = trunk.switchport ?? { mode: 'trunk' as const };
    sp.mode = 'trunk';
    if (sp.allowedVlanIds !== 'all') sp.allowedVlanIds = [...(sp.allowedVlanIds ?? []), ...vlanIds];
    trunk.switchport = sp;

    // Appended after existing rules, so user rules keep their priority.
    for (const rule of rules) firewall.rules.push({ ...rule, id: ctx.createId('firewallRule') });

    if (wan) {
      const masquerade = firewall.nat.find(
        (n) => n.kind === 'masquerade' && n.outInterfaceId === wan.id,
      );
      if (!masquerade)
        firewall.nat.push({
          id: ctx.createId('natRule'),
          kind: 'masquerade',
          outInterfaceId: wan.id,
        });
      else if (masquerade.kind === 'masquerade' && masquerade.sourceZoneIds)
        masquerade.sourceZoneIds.push(...zoneIds);
    }
    return { zoneIds };
  },
);
