import {
  addApp,
  addDevice,
  addDockerNetwork,
  addFirewallRule,
  addInterface,
  addLocation,
  addNatRule,
  addSubnet,
  addVlan,
  addWorkload,
  addZone,
  type Command,
  connectInterfaces,
  createProject,
  execute,
  type Project,
  placeDevice,
  sequentialContext,
  updateDevice,
  updateInterface,
} from '../../src';

const GiB = 1024 ** 3;

/**
 * The sample lab used across the mockups (docs/07, design/): rack with gw-01, sw-core, pi-dns and
 * nas-01; pve1 on an office shelf; ap-living and tv-salon in the living room; VLANs 10/20/30;
 * rule #4 IoT → LAN deny. It intentionally contains the issues shown in the mockups
 * (VLAN 30 missing on sw-core port 8, 192.168.20.15 assigned twice).
 */
export function buildHomeLab(): Project {
  const ctx = sequentialContext();
  let project = createProject('Home lab', ctx);
  const run = <P, R>(command: Command<P, R>, payload: P): R => {
    const out = execute(project, command, payload, ctx);
    project = out.project;
    return out.result;
  };
  const ifaceOf = (deviceId: string, name: string) => {
    const found = Object.values(project.interfaces).find(
      (i) => i.owner.id === deviceId && i.name === name,
    );
    if (!found) throw new Error(`No interface ${name} on ${deviceId}`);
    return found.id;
  };

  // Locations
  const rack = run(addLocation, {
    location: {
      kind: 'rack',
      name: 'Closet rack',
      units: 12,
      width: '10in',
      shelves: [{ u: 10, units: 1 }],
    },
    rect: { x: 2, y: 6, w: 18, h: 22 },
  });
  const shelf = run(addLocation, {
    location: { kind: 'shelf', name: 'Office shelf' },
    rect: { x: 24, y: 6, w: 20, h: 14 },
  });
  const room = run(addLocation, {
    location: { kind: 'room', name: 'Living room' },
    rect: { x: 24, y: 24, w: 20, h: 9 },
  });

  // Zones, VLANs, subnets
  const zWan = run(addZone, {
    zone: { name: 'WAN', kind: 'wan', color: 'sand', intraZone: 'deny' },
  });
  const zMgmt = run(addZone, {
    zone: { name: 'Mgmt', kind: 'internal', color: 'violet', intraZone: 'allow' },
  });
  const zLan = run(addZone, {
    zone: { name: 'LAN', kind: 'internal', color: 'sky', intraZone: 'allow' },
  });
  const zIot = run(addZone, {
    zone: { name: 'IoT', kind: 'internal', color: 'pink', intraZone: 'allow' },
  });
  const vMgmt = run(addVlan, { vlan: { vid: 10, name: 'Mgmt', color: 'violet' } });
  const vLan = run(addVlan, { vlan: { vid: 20, name: 'LAN', color: 'sky' } });
  const vIot = run(addVlan, { vlan: { vid: 30, name: 'IoT', color: 'pink' } });
  const sMgmt = run(addSubnet, {
    subnet: { cidr: '192.168.10.0/24', vlanId: vMgmt, zoneId: zMgmt, gateway: '192.168.10.1' },
  });
  const sLan = run(addSubnet, {
    subnet: {
      cidr: '192.168.20.0/24',
      vlanId: vLan,
      zoneId: zLan,
      gateway: '192.168.20.1',
      dhcp: { enabled: true, rangeStart: '192.168.20.100', rangeEnd: '192.168.20.199' },
    },
  });
  const sIot = run(addSubnet, {
    subnet: {
      cidr: '192.168.30.0/24',
      vlanId: vIot,
      zoneId: zIot,
      gateway: '192.168.30.1',
      dhcp: { enabled: true, rangeStart: '192.168.30.100', rangeEnd: '192.168.30.250' },
    },
  });

  // Devices
  const internet = run(addDevice, { kind: 'internet', position: { x: 8, y: 0 } }).deviceId;
  const gw = run(addDevice, {
    kind: 'router',
    name: 'gw-01',
    placement: { locationId: rack, u: 12 },
  }).deviceId;
  run(updateDevice, {
    id: gw,
    changes: { formFactor: { mount: 'rack', units: 1, width: '10in' } },
  });
  const sw = run(addDevice, {
    kind: 'switch',
    name: 'sw-core',
    placement: { locationId: rack, u: 11 },
  }).deviceId;
  run(updateDevice, {
    id: sw,
    changes: { formFactor: { mount: 'rack', units: 1, width: '10in' } },
  });
  const piDns = run(addDevice, {
    kind: 'sbc',
    name: 'pi-dns',
    placement: { locationId: rack, u: 10, onShelf: true },
  }).deviceId;
  const nas = run(addDevice, { kind: 'nas', name: 'nas-01' }).deviceId;
  run(updateDevice, {
    id: nas,
    changes: { formFactor: { mount: 'rack', units: 2, width: '10in' } },
  });
  run(placeDevice, { id: nas, locationId: rack, u: 8 }); // 2U rack NAS at U8–U9

  const pve = run(addDevice, {
    kind: 'mini-pc',
    name: 'pve1',
    placement: { locationId: shelf },
    position: { x: 1, y: 2 },
  }).deviceId;
  const ap = run(addDevice, {
    kind: 'access-point',
    name: 'ap-living',
    placement: { locationId: room },
    position: { x: 1, y: 2 },
  }).deviceId;
  const tv = run(addDevice, {
    kind: 'client',
    name: 'tv-salon',
    placement: { locationId: room },
    position: { x: 11, y: 2 },
  }).deviceId;
  run(updateDevice, { id: tv, changes: { clientType: 'tv' } });

  // pve1 hardware and OS
  const disk = ctx.createId('disk');
  const pool = ctx.createId('storagePool');
  run(updateDevice, {
    id: pve,
    changes: {
      hostname: 'pve1',
      os: { osId: 'proxmox-ve', version: '8.3' },
      hardware: {
        cpus: [
          {
            model: 'Intel Core i5-8500T',
            cores: 6,
            threads: 6,
            arch: 'amd64',
            perf: { score: 100, source: 'blender-opendata' },
          },
        ],
        memory: { type: 'DDR4', slotsTotal: 2, modules: [{ sizeBytes: 16 * GiB, count: 2 }] },
        disks: [{ id: disk, name: 'nvme0', type: 'ssd-nvme', sizeBytes: 1_000_204_886_016 }],
        pools: [
          {
            id: pool,
            name: 'local-lvm',
            layout: 'single',
            diskIds: [disk],
            filesystem: 'lvm-thin',
          },
        ],
        gpus: [],
      },
    },
  });
  const vmbr0 = run(addInterface, {
    iface: {
      owner: { type: 'device', id: pve },
      name: 'vmbr0',
      kind: 'bridge',
      switchport: { mode: 'trunk', allowedVlanIds: 'all' },
    },
  });
  run(updateInterface, { id: ifaceOf(pve, 'eth0'), changes: { parentId: vmbr0 } });

  // Router addressing and firewall
  const gwLan = ifaceOf(gw, 'lan0');
  run(updateInterface, {
    id: gwLan,
    changes: { switchport: { mode: 'trunk', allowedVlanIds: [vMgmt, vLan, vIot] } },
  });
  for (const [vid, subnetId, zoneId] of [
    [10, sMgmt, zMgmt],
    [20, sLan, zLan],
    [30, sIot, zIot],
  ] as const) {
    run(addInterface, {
      iface: {
        owner: { type: 'device', id: gw },
        name: `lan0.${vid}`,
        kind: 'vlan',
        parentId: gwLan,
        vlanTag: vid,
        zoneId,
        addresses: [{ mode: 'static', address: `192.168.${vid}.1`, subnetId }],
      },
    });
  }
  run(updateInterface, {
    id: ifaceOf(gw, 'wan0'),
    changes: { zoneId: zWan, addresses: [{ mode: 'dhcp' }] },
  });
  const rules = [
    {
      action: 'allow',
      protocol: 'any',
      source: { type: 'zone', id: zLan },
      destination: { type: 'any' },
    },
    {
      action: 'allow',
      protocol: 'udp',
      source: { type: 'zone', id: zIot },
      destination: { type: 'device', id: piDns },
      ports: [{ from: 53, to: 53 }],
    },
    {
      action: 'allow',
      protocol: 'any',
      source: { type: 'zone', id: zMgmt },
      destination: { type: 'any' },
    },
    {
      action: 'deny',
      protocol: 'any',
      source: { type: 'zone', id: zIot },
      destination: { type: 'zone', id: zLan },
      description: 'IoT → LAN',
    },
    {
      action: 'allow',
      protocol: 'tcp',
      source: { type: 'zone', id: zIot },
      destination: { type: 'internet' },
      ports: [{ from: 443, to: 443 }],
    },
  ] as const;
  for (const rule of rules)
    run(addFirewallRule, {
      deviceId: gw,
      rule: {
        enabled: true,
        ...rule,
        ports: 'ports' in rule ? [...rule.ports] : undefined,
      } as never,
    });
  run(addNatRule, {
    deviceId: gw,
    rule: { kind: 'masquerade', outInterfaceId: ifaceOf(gw, 'wan0') },
  });

  // Switch ports
  const port = (n: number) => ifaceOf(sw, `Port ${n}`);
  run(updateInterface, {
    id: port(1),
    changes: { switchport: { mode: 'trunk', allowedVlanIds: [vMgmt, vLan, vIot] } },
  });
  run(updateInterface, {
    id: port(2),
    changes: { switchport: { mode: 'trunk', nativeVlanId: vMgmt, allowedVlanIds: [vLan] } },
  });
  run(updateInterface, {
    id: port(3),
    changes: { switchport: { mode: 'access', accessVlanId: vLan } },
  });
  run(updateInterface, {
    id: port(4),
    changes: { switchport: { mode: 'access', accessVlanId: vLan } },
  });
  // Mockup issue: VLAN 30 is not allowed on the trunk to the access point.
  run(updateInterface, {
    id: port(8),
    changes: { switchport: { mode: 'trunk', nativeVlanId: vMgmt, allowedVlanIds: [vLan] } },
  });

  // Host addresses (nas-01 deliberately reuses .15 — duplicate IP issue in the mockups)
  run(updateInterface, {
    id: ifaceOf(nas, 'eth0'),
    changes: { addresses: [{ mode: 'static', address: '192.168.20.15', subnetId: sLan }] },
  });
  run(updateInterface, {
    id: ifaceOf(piDns, 'eth0'),
    changes: { addresses: [{ mode: 'static', address: '192.168.20.2', subnetId: sLan }] },
  });
  run(updateInterface, {
    id: vmbr0,
    changes: { addresses: [{ mode: 'static', address: '192.168.10.5', subnetId: sMgmt }] },
  });

  // Wi-Fi
  run(updateDevice, {
    id: ap,
    changes: {
      wifi: {
        ssids: [
          {
            id: 'ssid-home',
            name: 'Home',
            vlanId: vLan,
            bands: ['2.4', '5'],
            clientIsolation: false,
            security: 'wpa3',
          },
          {
            id: 'ssid-iot',
            name: 'Home-IoT',
            vlanId: vIot,
            bands: ['2.4'],
            clientIsolation: true,
            security: 'wpa2',
          },
        ],
      },
    },
  });

  // Cabling
  run(connectInterfaces, { a: ifaceOf(internet, 'wan'), b: ifaceOf(gw, 'wan0') });
  run(connectInterfaces, { a: gwLan, b: port(1) });
  run(connectInterfaces, { a: port(2), b: ifaceOf(pve, 'eth0') });
  run(connectInterfaces, { a: port(3), b: ifaceOf(nas, 'eth0') });
  run(connectInterfaces, { a: port(4), b: ifaceOf(piDns, 'eth0') });
  run(connectInterfaces, { a: port(8), b: ifaceOf(ap, 'eth0') });
  run(connectInterfaces, { a: ifaceOf(ap, 'wlan0'), b: ifaceOf(tv, 'wlan0'), ssidId: 'ssid-iot' });

  // Workloads on pve1
  const dockerVm = run(addWorkload, {
    workload: {
      kind: 'vm',
      name: 'docker-vm',
      host: { type: 'device', id: pve },
      tagIds: [],
      resources: { cpu: 2, memoryBytes: 8 * GiB, disks: [{ poolId: pool, sizeBytes: 128 * GiB }] },
      guestOs: { osId: 'debian', version: '12' },
      docker: { enabled: true, networkIds: [] },
    },
  });
  const net0 = run(addInterface, {
    iface: {
      owner: { type: 'workload', id: dockerVm },
      name: 'net0',
      kind: 'vnic',
      vlanTag: 20,
      addresses: [{ mode: 'static', address: '192.168.20.15', subnetId: sLan }],
    },
  });
  run(connectInterfaces, { a: net0, b: vmbr0 });
  const bridge = run(addDockerNetwork, {
    network: {
      host: { type: 'workload', id: dockerVm },
      name: 'bridge',
      driver: 'bridge',
      subnet: '172.17.0.0/16',
    },
  });
  const jellyfinCt = run(addWorkload, {
    workload: {
      kind: 'container',
      name: 'jellyfin',
      host: { type: 'workload', id: dockerVm },
      tagIds: [],
      image: 'lscr.io/linuxserver/jellyfin',
      tag: 'latest',
      network: { mode: 'docker-network', dockerNetworkId: bridge },
      portMappings: [{ hostPort: 8096, containerPort: 8096, protocol: 'tcp' }],
      volumes: [
        {
          name: 'jellyfin-config',
          containerPath: '/config',
          type: 'named',
          poolId: pool,
          sizeBytes: 2 * GiB,
        },
      ],
    },
  });
  run(addApp, {
    app: {
      name: 'Jellyfin',
      runsOn: { type: 'workload', id: jellyfinCt },
      role: 'app',
      tagIds: [],
      listeners: [{ port: 8096, protocol: 'tcp', purpose: 'web-ui' }],
      requirements: {
        min: { cpu: 1, memoryBytes: 1 * GiB, diskBytes: 2 * GiB },
        recommended: { cpu: 2, memoryBytes: 2 * GiB, diskBytes: 10 * GiB },
      },
      dependencies: [{ capability: 'media-storage', optional: true }],
      trafficPatterns: [
        {
          id: 'web',
          direction: 'inbound',
          peer: { kind: 'lan-clients' },
          protocol: 'tcp',
          port: 8096,
          purpose: 'web-ui',
          required: true,
        },
        {
          id: 'metadata',
          direction: 'outbound',
          peer: { kind: 'internet' },
          protocol: 'tcp',
          port: 443,
          purpose: 'metadata-fetch',
          required: false,
        },
      ],
      confidence: 'curated',
    },
  });
  for (const [name, template, cpu, mem] of [
    ['home-assistant', 'debian-12', 2, 4],
    ['unifi', 'debian-12', 1, 2],
  ] as const) {
    run(addWorkload, {
      workload: {
        kind: 'lxc',
        name,
        host: { type: 'device', id: pve },
        tagIds: [],
        template,
        unprivileged: true,
        resources: { cpu, memoryBytes: mem * GiB, disks: [{ poolId: pool, sizeBytes: 16 * GiB }] },
      },
    });
  }
  return project;
}
