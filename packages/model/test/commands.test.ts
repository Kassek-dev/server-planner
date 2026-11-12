import { applyPatches } from 'immer';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addDevice,
  addFirewallRule,
  addInterface,
  addLocation,
  addStack,
  addTag,
  addVlan,
  addWorkload,
  type Command,
  CommandError,
  commands,
  connectInterfaces,
  createId,
  deleteApp,
  deleteDevice,
  deleteDockerNetwork,
  deleteLocation,
  deleteStack,
  deleteSubnet,
  deleteTag,
  deleteVlan,
  deleteZone,
  execute,
  type ModelContext,
  moveFirewallRule,
  moveNode,
  type Project,
  ProjectSchema,
  placeDevice,
  setLinkRouting,
  setLinkWaypoints,
  updateApp,
  updateDevice,
  updateNatRule,
  updateWorkload,
} from '../src';
import { buildHomeLab } from './support/home-lab';

// Random IDs (no collisions with the fixture's sequential IDs), fixed clock.
const ctx: ModelContext = { createId, now: () => '2026-11-12T08:00:00.000Z' };
let lab: Project;

beforeEach(() => {
  lab = buildHomeLab();
});

/** Runs a command, asserts the result is still a valid project, returns it. */
function run<P, R>(project: Project, command: Command<P, R>, payload: P) {
  const out = execute(project, command, payload, ctx);
  const check = ProjectSchema.safeParse(out.project);
  if (!check.success) throw new Error(JSON.stringify(check.error.issues, null, 2));
  return out;
}

function expectRejected<P>(
  project: Project,
  command: Command<P, unknown>,
  payload: P,
  code: string,
) {
  try {
    execute(project, command, payload, ctx);
  } catch (error) {
    expect(error).toBeInstanceOf(CommandError);
    expect((error as CommandError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

const byName = (p: Project, name: string) => {
  const device = Object.values(p.devices).find((d) => d.name === name);
  if (!device) throw new Error(`no device ${name}`);
  return device;
};
const ifaceOf = (p: Project, deviceName: string, name: string) => {
  const owner = byName(p, deviceName).id;
  const iface = Object.values(p.interfaces).find((i) => i.owner.id === owner && i.name === name);
  if (!iface) throw new Error(`no ${deviceName}:${name}`);
  return iface;
};

/** Every reference between core entities points at something that exists. */
function expectNoDanglingCoreRefs(p: Project) {
  for (const link of Object.values(p.links)) {
    expect(p.interfaces[link.a], `link ${link.id} end a`).toBeDefined();
    expect(p.interfaces[link.b], `link ${link.id} end b`).toBeDefined();
  }
  for (const iface of Object.values(p.interfaces)) {
    const owners = iface.owner.type === 'device' ? p.devices : p.workloads;
    expect(owners[iface.owner.id], `interface ${iface.id} owner`).toBeDefined();
  }
  for (const w of Object.values(p.workloads)) {
    const hosts = w.host.type === 'device' ? p.devices : p.workloads;
    expect(hosts[w.host.id], `workload ${w.id} host`).toBeDefined();
  }
  for (const app of Object.values(p.apps)) {
    const hosts = app.runsOn.type === 'device' ? p.devices : p.workloads;
    expect(hosts[app.runsOn.id], `app ${app.id} host`).toBeDefined();
  }
  for (const d of Object.values(p.devices)) {
    if (d.placement) expect(p.locations[d.placement.locationId]).toBeDefined();
  }
}

describe('command runner', () => {
  it('produces undo patches that restore the previous project', () => {
    const { project, inversePatches, patches } = run(lab, deleteDevice, {
      id: byName(lab, 'pve1').id,
    });
    expect(applyPatches(project, inversePatches)).toEqual(lab);
    expect(applyPatches(lab, patches)).toEqual(project);
  });

  it('updates updatedAt and keeps the input untouched', () => {
    const before = structuredClone(lab);
    const { project } = run(lab, updateDevice, {
      id: byName(lab, 'nas-01').id,
      changes: { hostname: 'nas' },
    });
    expect(project.updatedAt).toBe('2026-11-12T08:00:00.000Z');
    expect(lab).toEqual(before);
  });

  it('registers every command under a unique name', () => {
    const names = Object.keys(commands);
    expect(names).toContain('device.add');
    expect(names).toContain('link.connect');
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('devices', () => {
  it('adds a device with its default ports', () => {
    const { project, result } = run(lab, addDevice, { kind: 'switch' });
    expect(project.devices[result.deviceId]?.name).toBe('switch-1');
    expect(result.interfaceIds).toHaveLength(8);
  });

  it('allows only one Internet node', () => {
    expectRejected(lab, addDevice, { kind: 'internet' }, 'INTERNET_EXISTS');
  });

  it('deleting a host removes everything it hosts', () => {
    const pve = byName(lab, 'pve1');
    const { project } = run(lab, deleteDevice, { id: pve.id });
    expect(project.devices[pve.id]).toBeUndefined();
    expect(Object.values(project.workloads)).toHaveLength(0);
    expect(Object.values(project.apps)).toHaveLength(0);
    expect(Object.values(project.dockerNetworks)).toHaveLength(0);
    expect(project.layout.nodes[pve.id]).toBeUndefined();
    // sw-core Port 2 survives, its cable to pve1 does not
    const port2 = ifaceOf(project, 'sw-core', 'Port 2');
    expect(Object.values(project.links).some((l) => l.a === port2.id || l.b === port2.id)).toBe(
      false,
    );
    expectNoDanglingCoreRefs(project);
  });

  it('deleting the router removes its VLAN sub-interfaces and cables', () => {
    const { project } = run(lab, deleteDevice, { id: byName(lab, 'gw-01').id });
    expect(Object.values(project.interfaces).some((i) => i.name.startsWith('lan0.'))).toBe(false);
    expectNoDanglingCoreRefs(project);
  });
});

describe('placement and locations', () => {
  const rackOf = (p: Project) => Object.values(p.locations).find((l) => l.kind === 'rack');
  const roomOf = (p: Project) => Object.values(p.locations).find((l) => l.kind === 'room');

  it('rack placement needs a unit and drops the stored canvas position', () => {
    const rack = rackOf(lab);
    const pve = byName(lab, 'pve1');
    if (!rack) throw new Error('no rack');
    const sw = run(lab, addDevice, { kind: 'switch', position: { x: 3, y: 3 } });
    const id = sw.result.deviceId;
    expectRejected(sw.project, placeDevice, { id, locationId: rack.id }, 'RACK_UNIT_REQUIRED');
    const placed = run(sw.project, placeDevice, { id, locationId: rack.id, u: 3 });
    expect(placed.project.devices[id]?.placement).toEqual({ locationId: rack.id, u: 3 });
    expect(placed.project.layout.nodes[id]).toBeUndefined();
    expectRejected(placed.project, moveNode, { id, x: 1, y: 1 }, 'RACK_POSITION_DERIVED');
    expectRejected(
      lab,
      placeDevice,
      { id: pve.id, locationId: rack.id, u: 5 },
      'RACK_STANDALONE_NEEDS_SHELF',
    );
  });

  it('units are only allowed in racks', () => {
    const room = roomOf(lab);
    if (!room) throw new Error('no room');
    expectRejected(
      lab,
      placeDevice,
      { id: byName(lab, 'pve1').id, locationId: room.id, u: 2 },
      'RACK_UNIT_OUTSIDE_RACK',
    );
  });

  it('the Internet node cannot be placed', () => {
    const room = roomOf(lab);
    if (!room) throw new Error('no room');
    expectRejected(
      lab,
      placeDevice,
      { id: byName(lab, 'Internet').id, locationId: room.id },
      'DEVICE_NOT_PLACEABLE',
    );
  });

  it('deleting a location keeps its devices unplaced', () => {
    const rack = rackOf(lab);
    if (!rack) throw new Error('no rack');
    const { project } = run(lab, deleteLocation, { id: rack.id });
    expect(byName(project, 'sw-core').placement).toBeUndefined();
    expect(project.layout.locations[rack.id]).toBeUndefined();
    expectNoDanglingCoreRefs(project);
  });

  it('racks and shelves nest in top-level rooms only', () => {
    const room = roomOf(lab);
    const rack = rackOf(lab);
    if (!room || !rack) throw new Error('fixture');
    const ok = run(lab, addLocation, {
      location: { kind: 'shelf', name: 'TV shelf', parentId: room.id },
    });
    expect(ok.project.locations[ok.result]?.parentId).toBe(room.id);
    expectRejected(
      lab,
      addLocation,
      { location: { kind: 'room', name: 'Nested', parentId: room.id } },
      'LOCATION_INVALID_PARENT',
    );
    expectRejected(
      lab,
      addLocation,
      { location: { kind: 'shelf', name: 'In rack', parentId: rack.id } },
      'LOCATION_INVALID_PARENT',
    );
  });
});

describe('links', () => {
  it('rejects cables between ports of the same device', () => {
    const a = ifaceOf(lab, 'sw-core', 'Port 5').id;
    const b = ifaceOf(lab, 'sw-core', 'Port 6').id;
    expectRejected(lab, connectInterfaces, { a, b }, 'LINK_SAME_DEVICE');
  });

  it('rejects a second cable on a used socket', () => {
    const used = ifaceOf(lab, 'sw-core', 'Port 1').id;
    const free = ifaceOf(lab, 'nas-01', 'eth1').id;
    expectRejected(lab, connectInterfaces, { a: free, b: used }, 'INTERFACE_IN_USE');
  });

  it('rejects mixing Wi-Fi radios with copper', () => {
    const radio = ifaceOf(lab, 'tv-salon', 'wlan0').id;
    const copper = ifaceOf(lab, 'sw-core', 'Port 6').id;
    expectRejected(lab, connectInterfaces, { a: radio, b: copper }, 'LINK_INVALID_KINDS');
  });

  it('allows several Wi-Fi clients on one radio and checks the SSID', () => {
    const phone = run(lab, addDevice, { kind: 'client', name: 'phone' });
    const radio = ifaceOf(phone.project, 'ap-living', 'wlan0').id;
    const wlan = ifaceOf(phone.project, 'phone', 'wlan0').id;
    expectRejected(
      phone.project,
      connectInterfaces,
      { a: radio, b: wlan, ssidId: 'nope' },
      'NOT_FOUND',
    );
    const linked = run(phone.project, connectInterfaces, {
      a: radio,
      b: wlan,
      ssidId: 'ssid-home',
    });
    expect(linked.project.links[linked.result]?.medium).toBe('wifi');
  });

  it('connects vNICs only to bridges, as virtual links', () => {
    const vm = Object.values(lab.workloads).find((w) => w.kind === 'vm');
    if (!vm) throw new Error('no vm');
    const added = run(lab, addInterface, {
      iface: { owner: { type: 'workload', id: vm.id }, name: 'net1', kind: 'vnic' },
    });
    const bridge = ifaceOf(lab, 'pve1', 'vmbr0').id;
    expectRejected(
      added.project,
      connectInterfaces,
      { a: added.result, b: ifaceOf(lab, 'sw-core', 'Port 6').id },
      'LINK_INVALID_KINDS',
    );
    const linked = run(added.project, connectInterfaces, { a: added.result, b: bridge });
    expect(linked.project.links[linked.result]?.medium).toBe('virtual');
  });
});

describe('link drawing (CAN-08)', () => {
  const firstLink = (project: Project) => {
    const link = Object.values(project.links).find((l) => l.medium !== 'virtual');
    if (!link) throw new Error('no link');
    return link.id;
  };

  it('stores rounded bend points and keeps them when the routing changes', () => {
    const id = firstLink(lab);
    const bent = run(lab, setLinkWaypoints, {
      id,
      waypoints: [
        { x: 4.4, y: 2 },
        { x: 9, y: 7.6 },
      ],
    });
    expect(bent.project.layout.links[id]).toEqual({
      routing: 'orthogonal',
      waypoints: [
        { x: 4, y: 2 },
        { x: 9, y: 8 },
      ],
    });
    const straight = run(bent.project, setLinkRouting, { id, routing: 'straight' });
    const back = run(straight.project, setLinkRouting, { id, routing: 'orthogonal' });
    expect(back.project.layout.links[id]?.waypoints).toHaveLength(2);
  });

  it('drops the layout entry when the cable is back to automatic routing', () => {
    const id = firstLink(lab);
    const bent = run(lab, setLinkWaypoints, { id, waypoints: [{ x: 1, y: 1 }] });
    const cleared = run(bent.project, setLinkWaypoints, { id, waypoints: [] });
    expect(cleared.project.layout.links[id]).toBeUndefined();
  });

  it('rejects too many bend points', () => {
    const id = firstLink(lab);
    const many = Array.from({ length: 17 }, (_, i) => ({ x: i, y: i }));
    expectRejected(lab, setLinkWaypoints, { id, waypoints: many }, 'TOO_MANY_WAYPOINTS');
  });
});

describe('network objects', () => {
  it('rejects duplicate VLAN IDs', () => {
    expectRejected(
      lab,
      addVlan,
      { vlan: { vid: 30, name: 'Dup', color: 'teal' } },
      'VLAN_VID_TAKEN',
    );
  });

  it('deleting a VLAN removes it from ports, subnets and SSIDs', () => {
    const iot = Object.values(lab.vlans).find((v) => v.vid === 30);
    if (!iot) throw new Error('no vlan');
    const { project } = run(lab, deleteVlan, { id: iot.id });
    const json = JSON.stringify({ i: project.interfaces, s: project.subnets, d: project.devices });
    expect(json).not.toContain(`"${iot.id}"`);
  });

  it('deleting a subnet keeps addresses but drops the reference', () => {
    const lan = Object.values(lab.subnets).find((s) => s.cidr === '192.168.20.0/24');
    if (!lan) throw new Error('no subnet');
    const { project } = run(lab, deleteSubnet, { id: lan.id });
    const nasEth0 = ifaceOf(project, 'nas-01', 'eth0');
    expect(nasEth0.addresses).toEqual([{ mode: 'static', address: '192.168.20.15' }]);
  });

  it('deleting a zone clears it from subnets and interfaces', () => {
    const wan = Object.values(lab.zones).find((z) => z.kind === 'wan');
    if (!wan) throw new Error('no zone');
    const { project } = run(lab, deleteZone, { id: wan.id });
    expect(ifaceOf(project, 'gw-01', 'wan0').zoneId).toBeUndefined();
  });

  it('reorders firewall rules (first match wins)', () => {
    const gw = byName(lab, 'gw-01');
    const rules = gw.firewall?.rules ?? [];
    const deny = rules[3];
    if (!deny) throw new Error('no rule');
    const { project } = run(lab, moveFirewallRule, {
      deviceId: gw.id,
      ruleId: deny.id,
      toIndex: 0,
    });
    expect(project.devices[gw.id]?.firewall?.rules[0]?.id).toBe(deny.id);
    expect(project.devices[gw.id]?.firewall?.rules).toHaveLength(rules.length);
  });

  it('rejects firewall rules on devices without a firewall', () => {
    const rule = {
      enabled: true,
      action: 'allow',
      protocol: 'any',
      source: { type: 'any' },
      destination: { type: 'any' },
    } as const;
    expectRejected(
      lab,
      addFirewallRule,
      { deviceId: byName(lab, 'sw-core').id, rule },
      'DEVICE_HAS_NO_FIREWALL',
    );
  });
});

describe('workloads and apps', () => {
  const vmOf = (p: Project) => Object.values(p.workloads).find((w) => w.kind === 'vm');

  it('rejects hosting cycles', () => {
    const vm = vmOf(lab);
    const container = Object.values(lab.workloads).find((w) => w.kind === 'container');
    if (!vm || !container) throw new Error('fixture');
    expectRejected(
      lab,
      updateWorkload,
      { id: vm.id, changes: { host: { type: 'workload', id: container.id } } },
      'WORKLOAD_HOST_CYCLE',
    );
  });

  it('removing a stack removes its containers', () => {
    const vm = vmOf(lab);
    if (!vm) throw new Error('no vm');
    const stack = run(lab, addStack, {
      stack: { name: 'immich', host: { type: 'workload', id: vm.id } },
    });
    const ct = run(stack.project, addWorkload, {
      workload: {
        kind: 'container',
        name: 'immich-server',
        host: { type: 'workload', id: vm.id },
        tagIds: [],
        stackId: stack.result,
        image: 'ghcr.io/immich-app/immich-server',
        tag: 'release',
        network: { mode: 'none' },
        portMappings: [],
        volumes: [],
      },
    });
    const { project } = run(ct.project, deleteStack, { id: stack.result });
    expect(project.workloads[ct.result]).toBeUndefined();
    expect(project.stacks[stack.result]).toBeUndefined();
  });

  it('removing a Docker network disconnects its containers', () => {
    const network = Object.values(lab.dockerNetworks)[0];
    if (!network) throw new Error('no network');
    const { project } = run(lab, deleteDockerNetwork, { id: network.id });
    const jellyfin = Object.values(project.workloads).find((w) => w.name === 'jellyfin');
    expect(jellyfin?.kind === 'container' && jellyfin.network).toEqual({ mode: 'none' });
    expectNoDanglingCoreRefs(project);
  });

  it('removing an app clears dependencies it satisfied', () => {
    const jellyfin = Object.values(lab.apps)[0];
    if (!jellyfin) throw new Error('no app');
    const dependent = run(lab, updateApp, {
      id: jellyfin.id,
      changes: { dependencies: [{ capability: 'self', optional: true, satisfiedBy: jellyfin.id }] },
    });
    const { project } = run(dependent.project, deleteApp, { id: jellyfin.id });
    expect(project.apps[jellyfin.id]).toBeUndefined();
  });
});

describe('tags', () => {
  it('deleting a tag removes it everywhere', () => {
    const tag = run(lab, addTag, { tag: { name: 'critical', color: 'pink' } });
    const nas = byName(tag.project, 'nas-01');
    const tagged = run(tag.project, updateDevice, {
      id: nas.id,
      changes: { tagIds: [tag.result] },
    });
    const { project } = run(tagged.project, deleteTag, { id: tag.result });
    expect(project.devices[nas.id]?.tagIds).toEqual([]);
    expect(project.tags[tag.result]).toBeUndefined();
  });
});

describe('NAT', () => {
  it('updates a NAT rule in place, keeping its id', () => {
    const gw = byName(lab, 'gw-01');
    const nat = gw.firewall?.nat[0];
    if (!nat) throw new Error('fixture');
    const wan = ifaceOf(lab, 'gw-01', 'wan0');
    const { project } = run(lab, updateNatRule, {
      deviceId: gw.id,
      ruleId: nat.id,
      rule: {
        kind: 'port-forward',
        inInterfaceId: wan.id,
        protocol: 'tcp',
        externalPort: 443,
        target: { ip: '192.168.20.10', port: 443 },
      },
    });
    expect(project.devices[gw.id]?.firewall?.nat[0]).toMatchObject({
      id: nat.id,
      kind: 'port-forward',
      externalPort: 443,
    });
  });
});
