import {
  addInterface,
  type Project,
  parseProjectFile,
  setDeviceOs,
  updateDevice,
  updateInterface,
} from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import dualStack from '../../../../../fixtures/schema/v4/dual-stack.json';
import { deviceByName, homeLab, sessionWith } from '../canvas/testSupport';
import { dhcpReservations, ifupdown, linuxName, netConfigFormat, netplan } from './netconfig';

/** EXP-07 host network configuration from the home lab's pve1 (vmbr0 on eth0, 192.168.10.5). */

const lab = homeLab();
const pve = deviceByName(lab, 'pve1');

function edit(run: (session: ReturnType<typeof sessionWith>) => void): Project {
  const session = sessionWith(homeLab());
  run(session);
  const project = session.getState().project;
  if (!project) throw new Error('no project');
  return project;
}

describe('network configuration export (EXP-07)', () => {
  it('picks the format from the OS', () => {
    expect(netConfigFormat(lab, pve.id)).toBe('ifupdown');
    expect(netConfigFormat(lab, deviceByName(lab, 'sw-core').id)).toBeUndefined();
  });

  it('writes a Proxmox bridge with its port, address and gateway', () => {
    const text = ifupdown(lab, pve.id);
    expect(text).toContain('iface eth0 inet manual');
    expect(text).toContain(
      [
        'auto vmbr0',
        'iface vmbr0 inet static',
        '    address 192.168.10.5/24',
        '    gateway 192.168.10.1',
        '    bridge-ports eth0',
        '    bridge-stp off',
        '    bridge-fd 0',
        '    bridge-vlan-aware yes',
        '    bridge-vids 2-4094',
      ].join('\n'),
    );
  });

  it('writes Netplan for Ubuntu with a VLAN on the bridge', () => {
    const project = edit((s) => {
      s.dispatch(setDeviceOs, {
        id: pve.id,
        os: { osId: 'ubuntu-server' as const, version: '24.04' },
      });
      const bridge = Object.values(s.getState().project?.interfaces ?? {}).find(
        (i) => i.owner.id === pve.id && i.kind === 'bridge',
      );
      if (!bridge) throw new Error('no bridge');
      s.dispatch(addInterface, {
        iface: {
          owner: { type: 'device', id: pve.id },
          name: 'vlan20',
          kind: 'vlan',
          parentId: bridge.id,
          vlanTag: 20,
        },
      });
    });
    const yml = netplan(project, pve.id);
    expect(yml).toContain('  bridges:\n    "vmbr0":\n      interfaces: ["eth0"]');
    expect(yml).toContain('      addresses: ["192.168.10.5/24"]');
    expect(yml).toContain('        via: "192.168.10.1"');
    expect(yml).toContain('  vlans:\n    "vmbr0.20":\n      id: 20\n      link: "vmbr0"');
  });

  it('cannot be tricked into extra lines by names from an imported project', () => {
    expect(linuxName('eth0\nauto evil')).toBe('eth0autoevil');
    const project = edit((s) => {
      s.dispatch(updateDevice, { id: pve.id, changes: { name: 'pve1\n  up rm -rf /' } });
      const eth0 = Object.values(s.getState().project?.interfaces ?? {}).find(
        (i) => i.owner.id === pve.id && i.name === 'eth0',
      );
      if (eth0)
        s.dispatch(updateInterface, { id: eth0.id, changes: { name: 'eth0\n  up reboot' } });
    });
    const text = ifupdown(project, pve.id);
    expect(
      text
        .split('\n')
        .some((l) => l.trim().startsWith('up rm') || l.trim().startsWith('up reboot')),
    ).toBe(false);
  });

  it('lists DHCP reservations as dnsmasq lines', () => {
    const nas = deviceByName(lab, 'nas-01');
    const project = edit((s) => {
      const eth0 = Object.values(s.getState().project?.interfaces ?? {}).find(
        (i) => i.owner.id === nas.id && i.name === 'eth0',
      );
      if (!eth0) throw new Error('no eth0');
      s.dispatch(updateInterface, {
        id: eth0.id,
        changes: {
          mac: 'AA:BB:CC:00:11:22',
          addresses: [{ mode: 'dhcp-reservation', address: '192.168.20.15', subnetId: 'sub_0013' }],
        },
      });
    });
    expect(dhcpReservations(project)).toContain('dhcp-host=aa:bb:cc:00:11:22,192.168.20.15,nas-01');
    expect(dhcpReservations(lab)).toContain('No interface uses a DHCP reservation');
  });

  it('writes the IPv6 address of a dual-stack host (NET-17)', () => {
    const dual = parseProjectFile(dualStack).file.project;
    const host = deviceByName(dual, 'pve1');
    const text = ifupdown(dual, host.id);
    expect(text).toContain('iface vmbr0 inet static');
    expect(text).toContain(
      [
        'iface vmbr0 inet6 static',
        '    address fd20:4d2:20::5/64',
        '    gateway fd20:4d2:20::1',
      ].join('\n'),
    );
    // The card's ports show up as unconfigured physical ports.
    expect(text).not.toContain('inet6 static\n    address 192.');

    const plan = netplan(
      {
        ...dual,
        devices: {
          ...dual.devices,
          [host.id]: { ...host, os: { osId: 'ubuntu-server' as const, version: '24.04' } },
        },
      },
      host.id,
    );
    expect(plan).toContain('addresses: ["192.168.10.5/24", "fd20:4d2:20::5/64"]');
    expect(plan).toContain('  - to: "::/0"');
  });

  it('marks SLAAC and DHCPv6 interfaces', () => {
    const dual = parseProjectFile(dualStack).file.project;
    const pi = deviceByName(dual, 'pi-dns');
    const debian = {
      ...dual,
      devices: {
        ...dual.devices,
        [pi.id]: { ...pi, os: { osId: 'debian' as const, version: '12' } },
      },
    };
    expect(ifupdown(debian, pi.id)).toContain('iface eth0 inet6 auto');
    const ubuntu = {
      ...dual,
      devices: {
        ...dual.devices,
        [pi.id]: { ...pi, os: { osId: 'ubuntu-server' as const, version: '24.04' } },
      },
    };
    expect(netplan(ubuntu, pi.id)).toContain('accept-ra: true');
  });
});
