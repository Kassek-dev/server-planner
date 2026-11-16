import {
  addCard,
  addSubnet,
  type Command,
  execute,
  ID_PREFIXES,
  type ModelContext,
  type Project,
  setExpansion,
  updateInterface,
} from '../../src';
import { buildHomeLab } from './home-lab';

/**
 * Home lab + schema v3 inputs (NET-17, LIB-05): an IPv6 prefix on the LAN VLAN (dual-stack) with
 * the router, pve1 (static) and pi-dns (SLAAC) addressed, and a 10G NIC in pve1's only PCIe slot.
 * IDs continue from 2000.
 */
export function buildDualStackLab(): Project {
  let counter = 2000;
  const ctx: ModelContext = {
    createId: (type) => {
      counter += 1;
      return `${ID_PREFIXES[type]}_${String(counter).padStart(4, '0')}` as never;
    },
    now: () => '2026-11-11T12:00:00.000Z',
  };
  let project = buildHomeLab();
  const run = <P, R>(command: Command<P, R>, payload: P): R => {
    const out = execute(project, command, payload, ctx);
    project = out.project;
    return out.result;
  };
  const device = (name: string) => {
    const d = Object.values(project.devices).find((x) => x.name === name);
    if (!d) throw new Error(`no ${name}`);
    return d.id;
  };
  const iface = (deviceName: string, name: string) => {
    const id = device(deviceName);
    const found = Object.values(project.interfaces).find(
      (i) => i.owner.id === id && i.name === name,
    );
    if (!found) throw new Error(`no ${deviceName}:${name}`);
    return found;
  };
  const lan = Object.values(project.subnets).find((s) => s.cidr === '192.168.20.0/24');
  if (!lan) throw new Error('no LAN');
  const v6 = run(addSubnet, {
    subnet: {
      cidr: 'fd20:4d2:20::/64',
      ...(lan.vlanId ? { vlanId: lan.vlanId } : {}),
      ...(lan.zoneId ? { zoneId: lan.zoneId } : {}),
      gateway: 'fd20:4d2:20::1',
      ra: 'slaac',
      name: 'LAN IPv6',
    },
  });
  const add = (
    target: ReturnType<typeof iface>,
    address: Project['interfaces'][string]['addresses'][number],
  ) =>
    run(updateInterface, { id: target.id, changes: { addresses: [...target.addresses, address] } });
  add(iface('gw-01', 'lan0.20'), { mode: 'static', address: 'fd20:4d2:20::1', subnetId: v6 });
  add(iface('pve1', 'vmbr0'), { mode: 'static', address: 'fd20:4d2:20::5', subnetId: v6 });
  add(iface('pi-dns', 'eth0'), { mode: 'slaac', subnetId: v6 });

  const pve = device('pve1');
  run(setExpansion, { id: pve, expansion: { pcieSlots: 1, m2Slots: 1, sataBays: 0 } });
  run(addCard, {
    deviceId: pve,
    card: {
      kind: 'nic',
      model: 'Intel X520-DA2',
      slot: 'pcie',
      ports: { count: 2, kind: 'sfp+', speedMbps: 10000 },
    },
  });
  return project;
}
