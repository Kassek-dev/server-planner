import { SINGLE_LINK_KINDS, VIRTUAL_KINDS } from '../defaults';
import { cableLabel } from '../labels';
import type {
  Firewall,
  FirewallRule,
  Interface,
  Link,
  NatRule,
  Route,
  Subnet,
  Vlan,
  Zone,
} from '../schema/network';
import type { Project } from '../schema/project';
import { removeInterface, removeLink } from './cascade';
import {
  applyChanges,
  CommandError,
  type DistributiveOmit,
  defineCommand,
  getOrThrow,
} from './core';

/** Network commands — docs/02 § 6, docs/05 § 4.4. */

// ---------- interfaces ----------

export type NewInterface = Omit<Interface, 'id' | 'addresses' | 'enabled'> &
  Partial<Pick<Interface, 'addresses' | 'enabled'>>;

export const addInterface = defineCommand(
  'interface.add',
  (draft, { iface }: { iface: NewInterface }, ctx): string => {
    if (iface.owner.type === 'device') getOrThrow(draft.devices, iface.owner.id, 'device');
    else getOrThrow(draft.workloads, iface.owner.id, 'workload');
    if (iface.parentId !== undefined) getOrThrow(draft.interfaces, iface.parentId, 'interface');
    const id = ctx.createId('interface');
    draft.interfaces[id] = { addresses: [], enabled: true, ...iface, id };
    return id;
  },
);

export const updateInterface = defineCommand(
  'interface.update',
  (draft, { id, changes }: { id: string; changes: Partial<Omit<Interface, 'id' | 'owner'>> }) => {
    const iface = getOrThrow(draft.interfaces, id, 'interface');
    if (changes.parentId !== undefined) {
      if (changes.parentId === id) throw new CommandError('INTERFACE_SELF_PARENT', { id });
      getOrThrow(draft.interfaces, changes.parentId, 'interface');
    }
    applyChanges(iface, changes);
  },
);

export const deleteInterface = defineCommand(
  'interface.delete',
  (draft, { id }: { id: string }) => {
    getOrThrow(draft.interfaces, id, 'interface');
    removeInterface(draft, id);
  },
);

// ---------- links ----------

const isVirtual = (i: Interface) => VIRTUAL_KINDS.includes(i.kind);

function linksOf(draft: Project, interfaceId: string): Link[] {
  return Object.values(draft.links).filter((l) => l.a === interfaceId || l.b === interfaceId);
}

function defaultMedium(a: Interface, b: Interface): Link['medium'] {
  if (a.kind === 'wifi-radio') return 'wifi';
  if (isVirtual(a) || isVirtual(b)) return 'virtual';
  if (a.kind.startsWith('sfp') || a.kind.startsWith('qsfp')) return 'fiber';
  return 'copper';
}

export interface ConnectPayload {
  a: string;
  b: string;
  medium?: Link['medium'];
  ssidId?: string;
}

/** Connects two interfaces (CAN-04). Rejects combinations that cannot exist physically. */
export const connectInterfaces = defineCommand(
  'link.connect',
  (draft, { a, b, medium, ssidId }: ConnectPayload, ctx): string => {
    if (a === b) throw new CommandError('LINK_SAME_INTERFACE', { id: a });
    const ia = getOrThrow(draft.interfaces, a, 'interface');
    const ib = getOrThrow(draft.interfaces, b, 'interface');

    const virtual = isVirtual(ia) || isVirtual(ib);
    if (virtual) {
      const kinds = new Set([ia.kind, ib.kind]);
      if (!(kinds.has('vnic') && kinds.has('bridge'))) {
        throw new CommandError('LINK_INVALID_KINDS', { a: ia.kind, b: ib.kind });
      }
    } else {
      if (ia.owner.id === ib.owner.id)
        throw new CommandError('LINK_SAME_DEVICE', { id: ia.owner.id });
      const wifiEnds = Number(ia.kind === 'wifi-radio') + Number(ib.kind === 'wifi-radio');
      if (wifiEnds === 1) throw new CommandError('LINK_INVALID_KINDS', { a: ia.kind, b: ib.kind });
    }

    for (const iface of [ia, ib]) {
      const existing = linksOf(draft, iface.id);
      if (existing.some((l) => l.a === (iface === ia ? b : a) || l.b === (iface === ia ? b : a))) {
        throw new CommandError('LINK_EXISTS', { a, b });
      }
      if (SINGLE_LINK_KINDS.includes(iface.kind) && existing.length > 0) {
        throw new CommandError('INTERFACE_IN_USE', { id: iface.id });
      }
    }

    const resolvedMedium = medium ?? defaultMedium(ia, ib);
    if (ssidId !== undefined) {
      if (resolvedMedium !== 'wifi') throw new CommandError('LINK_SSID_NOT_WIFI', { ssidId });
      const ssidExists = [ia, ib].some((i) =>
        draft.devices[i.owner.id]?.wifi?.ssids.some((s) => s.id === ssidId),
      );
      if (!ssidExists) throw new CommandError('NOT_FOUND', { entity: 'ssid', id: ssidId });
    }

    const id = ctx.createId('link');
    draft.links[id] = {
      id,
      a,
      b,
      medium: resolvedMedium,
      tagIds: [],
      ...(ssidId !== undefined ? { ssidId } : {}),
    };
    return id;
  },
);

export const updateLink = defineCommand(
  'link.update',
  (draft, { id, changes }: { id: string; changes: Partial<Omit<Link, 'id' | 'a' | 'b'>> }) => {
    applyChanges(getOrThrow(draft.links, id, 'link'), changes);
  },
);

/** LBL-03: labels physical cables from a pattern; existing labels stay unless `overwrite`. */
export const labelCables = defineCommand(
  'link.labelCables',
  (draft, { pattern, overwrite = false }: { pattern?: string; overwrite?: boolean }): number => {
    let count = 0;
    for (const link of Object.values(draft.links)) {
      if (link.medium === 'wifi' || link.medium === 'virtual') continue;
      if (link.cable?.label && !overwrite) continue;
      link.cable = { ...link.cable, label: cableLabel(draft, link, pattern) };
      count += 1;
    }
    return count;
  },
);

export const deleteLink = defineCommand('link.delete', (draft, { id }: { id: string }) => {
  getOrThrow(draft.links, id, 'link');
  removeLink(draft, id);
});

// ---------- VLANs, subnets, zones ----------

function checkVid(draft: Project, vid: number, selfId?: string) {
  if (Object.values(draft.vlans).some((v) => v.vid === vid && v.id !== selfId)) {
    throw new CommandError('VLAN_VID_TAKEN', { vid });
  }
}

export const addVlan = defineCommand(
  'vlan.add',
  (draft, { vlan }: { vlan: Omit<Vlan, 'id'> }, ctx): string => {
    checkVid(draft, vlan.vid);
    const id = ctx.createId('vlan');
    draft.vlans[id] = { ...vlan, id };
    return id;
  },
);

export const updateVlan = defineCommand(
  'vlan.update',
  (draft, { id, changes }: { id: string; changes: Partial<Omit<Vlan, 'id'>> }) => {
    const vlan = getOrThrow(draft.vlans, id, 'vlan');
    if (changes.vid !== undefined) checkVid(draft, changes.vid, id);
    applyChanges(vlan, changes);
  },
);

export const deleteVlan = defineCommand('vlan.delete', (draft, { id }: { id: string }) => {
  getOrThrow(draft.vlans, id, 'vlan');
  for (const iface of Object.values(draft.interfaces)) {
    const sp = iface.switchport;
    if (!sp) continue;
    if (sp.accessVlanId === id) delete sp.accessVlanId;
    if (sp.nativeVlanId === id) delete sp.nativeVlanId;
    if (Array.isArray(sp.allowedVlanIds))
      sp.allowedVlanIds = sp.allowedVlanIds.filter((v) => v !== id);
  }
  for (const subnet of Object.values(draft.subnets)) if (subnet.vlanId === id) delete subnet.vlanId;
  for (const device of Object.values(draft.devices)) {
    for (const ssid of device.wifi?.ssids ?? []) if (ssid.vlanId === id) delete ssid.vlanId;
  }
  delete draft.vlans[id];
});

export const addSubnet = defineCommand(
  'subnet.add',
  (draft, { subnet }: { subnet: Omit<Subnet, 'id'> }, ctx): string => {
    if (subnet.vlanId !== undefined) getOrThrow(draft.vlans, subnet.vlanId, 'vlan');
    if (subnet.zoneId !== undefined) getOrThrow(draft.zones, subnet.zoneId, 'zone');
    const id = ctx.createId('subnet');
    draft.subnets[id] = { ...subnet, id };
    return id;
  },
);

export const updateSubnet = defineCommand(
  'subnet.update',
  (draft, { id, changes }: { id: string; changes: Partial<Omit<Subnet, 'id'>> }) => {
    applyChanges(getOrThrow(draft.subnets, id, 'subnet'), changes);
  },
);

/** Keeps static addresses (they are user input) but drops the subnet reference. */
export const deleteSubnet = defineCommand('subnet.delete', (draft, { id }: { id: string }) => {
  getOrThrow(draft.subnets, id, 'subnet');
  for (const iface of Object.values(draft.interfaces)) {
    for (const assignment of iface.addresses)
      if (assignment.subnetId === id) delete assignment.subnetId;
  }
  delete draft.subnets[id];
});

export const addZone = defineCommand(
  'zone.add',
  (draft, { zone }: { zone: Omit<Zone, 'id'> }, ctx): string => {
    const id = ctx.createId('zone');
    draft.zones[id] = { ...zone, id };
    return id;
  },
);

export const updateZone = defineCommand(
  'zone.update',
  (draft, { id, changes }: { id: string; changes: Partial<Omit<Zone, 'id'>> }) => {
    applyChanges(getOrThrow(draft.zones, id, 'zone'), changes);
  },
);

export const deleteZone = defineCommand('zone.delete', (draft, { id }: { id: string }) => {
  getOrThrow(draft.zones, id, 'zone');
  for (const subnet of Object.values(draft.subnets)) if (subnet.zoneId === id) delete subnet.zoneId;
  for (const iface of Object.values(draft.interfaces)) if (iface.zoneId === id) delete iface.zoneId;
  delete draft.zones[id];
});

// ---------- firewall, NAT, routes ----------

function firewallOf(draft: Project, deviceId: string): Firewall {
  const device = getOrThrow(draft.devices, deviceId, 'device');
  if (!device.firewall) throw new CommandError('DEVICE_HAS_NO_FIREWALL', { id: deviceId });
  return device.firewall;
}

function ruleIndex(firewall: Firewall, ruleId: string): number {
  const index = firewall.rules.findIndex((r) => r.id === ruleId);
  if (index < 0) throw new CommandError('NOT_FOUND', { entity: 'firewallRule', id: ruleId });
  return index;
}

export const addFirewallRule = defineCommand(
  'firewall.addRule',
  (
    draft,
    { deviceId, rule, index }: { deviceId: string; rule: Omit<FirewallRule, 'id'>; index?: number },
    ctx,
  ): string => {
    const firewall = firewallOf(draft, deviceId);
    const id = ctx.createId('firewallRule');
    firewall.rules.splice(index ?? firewall.rules.length, 0, { ...rule, id });
    return id;
  },
);

export const updateFirewallRule = defineCommand(
  'firewall.updateRule',
  (
    draft,
    {
      deviceId,
      ruleId,
      changes,
    }: { deviceId: string; ruleId: string; changes: Partial<Omit<FirewallRule, 'id'>> },
  ) => {
    const firewall = firewallOf(draft, deviceId);
    const rule = firewall.rules[ruleIndex(firewall, ruleId)];
    if (rule) applyChanges(rule, changes);
  },
);

/** Reorders a rule; order is priority (first match wins). */
export const moveFirewallRule = defineCommand(
  'firewall.moveRule',
  (draft, { deviceId, ruleId, toIndex }: { deviceId: string; ruleId: string; toIndex: number }) => {
    const firewall = firewallOf(draft, deviceId);
    const [rule] = firewall.rules.splice(ruleIndex(firewall, ruleId), 1);
    if (rule) firewall.rules.splice(Math.max(0, Math.min(toIndex, firewall.rules.length)), 0, rule);
  },
);

export const deleteFirewallRule = defineCommand(
  'firewall.deleteRule',
  (draft, { deviceId, ruleId }: { deviceId: string; ruleId: string }) => {
    const firewall = firewallOf(draft, deviceId);
    firewall.rules.splice(ruleIndex(firewall, ruleId), 1);
  },
);

export const addNatRule = defineCommand(
  'nat.add',
  (
    draft,
    { deviceId, rule }: { deviceId: string; rule: DistributiveOmit<NatRule, 'id'> },
    ctx,
  ): string => {
    const firewall = firewallOf(draft, deviceId);
    const id = ctx.createId('natRule');
    firewall.nat.push({ ...rule, id } as NatRule);
    return id;
  },
);

export const updateNatRule = defineCommand(
  'nat.update',
  (
    draft,
    {
      deviceId,
      ruleId,
      rule,
    }: { deviceId: string; ruleId: string; rule: DistributiveOmit<NatRule, 'id'> },
  ) => {
    const firewall = firewallOf(draft, deviceId);
    const index = firewall.nat.findIndex((r) => r.id === ruleId);
    if (index < 0) throw new CommandError('NOT_FOUND', { entity: 'natRule', id: ruleId });
    firewall.nat[index] = { ...rule, id: ruleId } as NatRule;
  },
);

export const deleteNatRule = defineCommand(
  'nat.delete',
  (draft, { deviceId, ruleId }: { deviceId: string; ruleId: string }) => {
    const firewall = firewallOf(draft, deviceId);
    const index = firewall.nat.findIndex((r) => r.id === ruleId);
    if (index < 0) throw new CommandError('NOT_FOUND', { entity: 'natRule', id: ruleId });
    firewall.nat.splice(index, 1);
  },
);

export const addRoute = defineCommand(
  'route.add',
  (draft, { route }: { route: Omit<Route, 'id'> }, ctx): string => {
    getOrThrow(draft.devices, route.deviceId, 'device');
    const id = ctx.createId('route');
    draft.routes[id] = { ...route, id };
    return id;
  },
);

export const updateRoute = defineCommand(
  'route.update',
  (draft, { id, changes }: { id: string; changes: Partial<Omit<Route, 'id' | 'deviceId'>> }) => {
    applyChanges(getOrThrow(draft.routes, id, 'route'), changes);
  },
);

export const deleteRoute = defineCommand('route.delete', (draft, { id }: { id: string }) => {
  getOrThrow(draft.routes, id, 'route');
  delete draft.routes[id];
});
