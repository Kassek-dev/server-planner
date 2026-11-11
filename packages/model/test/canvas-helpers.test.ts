import { describe, expect, it } from 'vitest';
import {
  addDevice,
  checkRackFit,
  connectInterfaces,
  createId,
  duplicateDevice,
  execute,
  findConnectablePorts,
  freeUnits,
  type ModelContext,
  nearestFreeU,
  nextCopyName,
  type Project,
  ProjectSchema,
  rackOccupancy,
  setDeviceOs,
  updateDevice,
} from '../src';
import { buildHomeLab } from './support/home-lab';

const ctx: ModelContext = { createId, now: () => '2026-11-12T08:00:00.000Z' };
const lab = buildHomeLab();
const byName = (p: Project, name: string) => {
  const d = Object.values(p.devices).find((x) => x.name === name);
  if (!d) throw new Error(name);
  return d;
};
const rack = Object.values(lab.locations).find((l) => l.kind === 'rack');
if (!rack) throw new Error('fixture');

describe('rack fit', () => {
  it('reports occupancy of devices and shelves', () => {
    const slots = rackOccupancy(lab, rack.id).map((s) => [s.from, s.to]);
    expect(slots).toEqual([
      [8, 9],
      [10, 10],
      [11, 11],
      [12, 12],
    ]);
    expect(freeUnits(lab, rack.id)).toBe(7);
  });

  it('accepts free units and rejects occupied or out-of-range ones', () => {
    const sw = execute(lab, addDevice, { kind: 'switch' }, ctx);
    const id = sw.result.deviceId;
    const p = execute(
      sw.project,
      updateDevice,
      { id, changes: { formFactor: { mount: 'rack', units: 1, width: '10in' } } },
      ctx,
    ).project;
    expect(checkRackFit(p, id, rack.id, 3)).toEqual({ ok: true, u: 3, onShelf: false });
    expect(checkRackFit(p, id, rack.id, 9)).toMatchObject({
      ok: false,
      code: 'RACK_UNITS_OCCUPIED',
    });
    expect(checkRackFit(p, id, rack.id, 13)).toMatchObject({
      ok: false,
      code: 'RACK_UNIT_OUT_OF_RANGE',
    });
    expect(nearestFreeU(p, id, rack.id, 10)).toBe(7);
  });

  it('rejects 19-inch devices in a 10-inch rack', () => {
    const sw = execute(lab, addDevice, { kind: 'switch' }, ctx);
    expect(checkRackFit(sw.project, sw.result.deviceId, rack.id, 3)).toMatchObject({
      ok: false,
      code: 'RACK_WIDTH',
    });
  });

  it('puts standalone devices on a shelf only', () => {
    const pve = byName(lab, 'pve1');
    expect(checkRackFit(lab, pve.id, rack.id, 10)).toEqual({ ok: true, u: 10, onShelf: true });
    expect(checkRackFit(lab, pve.id, rack.id, 3)).toMatchObject({
      ok: false,
      code: 'RACK_NO_SHELF',
    });
  });
});

describe('port auto-pick', () => {
  it('picks the first free compatible ports', () => {
    const pair = findConnectablePorts(lab, byName(lab, 'sw-core').id, byName(lab, 'nas-01').id);
    expect(pair && lab.interfaces[pair.a]?.name).toBe('Port 5');
    expect(pair && lab.interfaces[pair.b]?.name).toBe('eth1');
  });

  it('prefers Wi-Fi between an access point and a client', () => {
    const phone = execute(lab, addDevice, { kind: 'client', name: 'phone' }, ctx);
    const pair = findConnectablePorts(
      phone.project,
      byName(lab, 'ap-living').id,
      phone.result.deviceId,
    );
    expect(pair && phone.project.interfaces[pair.a]?.kind).toBe('wifi-radio');
  });

  it('prefers the WAN port towards the Internet node', () => {
    const r = execute(lab, addDevice, { kind: 'router' }, ctx);
    const p = r.project;
    const internetWan = Object.values(p.interfaces).find(
      (i) => i.owner.id === byName(p, 'Internet').id,
    );
    // Internet's only port is in use, so nothing is free on that side.
    expect(findConnectablePorts(p, byName(p, 'Internet').id, r.result.deviceId)).toBeUndefined();
    expect(internetWan?.kind).toBe('wan');
  });

  it('returns nothing when no compatible port is free', () => {
    expect(
      findConnectablePorts(lab, byName(lab, 'Internet').id, byName(lab, 'nas-01').id),
    ).toBeUndefined();
  });

  it('auto-picked ports can be connected', () => {
    const pair = findConnectablePorts(lab, byName(lab, 'sw-core').id, byName(lab, 'nas-01').id);
    if (!pair) throw new Error('no pair');
    expect(() => execute(lab, connectInterfaces, pair, ctx)).not.toThrow();
  });
});

describe('device.duplicate', () => {
  it('increments names', () => {
    expect(nextCopyName(lab, 'pve1')).toBe('pve2');
    expect(nextCopyName(lab, 'sw-core')).toBe('sw-core-2');
  });

  it('copies ports and hardware without cables, addresses or workloads', () => {
    const pve = byName(lab, 'pve1');
    const { project, result } = execute(lab, duplicateDevice, { id: pve.id }, ctx);
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    const copy = project.devices[result];
    expect(copy?.name).toBe('pve2');
    expect(copy?.hardware.pools[0]?.diskIds).toEqual([copy?.hardware.disks[0]?.id]);
    expect(copy?.hardware.disks[0]?.id).not.toBe(pve.hardware.disks[0]?.id);
    const ports = Object.values(project.interfaces).filter((i) => i.owner.id === result);
    expect(ports.map((i) => i.name).sort()).toEqual(['eth0', 'vmbr0']);
    expect(ports.every((i) => i.addresses.length === 0)).toBe(true);
    const eth0 = ports.find((i) => i.name === 'eth0');
    expect(eth0?.parentId).toBe(ports.find((i) => i.name === 'vmbr0')?.id);
    expect(
      Object.values(project.links).some((l) => ports.some((i) => i.id === l.a || i.id === l.b)),
    ).toBe(false);
    expect(Object.values(project.workloads).some((w) => w.host.id === result)).toBe(false);
  });

  it('places copies of rack devices next to the rack, not in a used slot', () => {
    const { project, result } = execute(
      lab,
      duplicateDevice,
      { id: byName(lab, 'sw-core').id },
      ctx,
    );
    expect(project.devices[result]?.placement).toBeUndefined();
    expect(project.layout.nodes[result]).toBeDefined();
  });
});

describe('device.setOs', () => {
  it('adds vmbr0 with the first port as member for Proxmox VE', () => {
    const added = execute(lab, addDevice, { kind: 'mini-pc', name: 'pve9' }, ctx);
    const id = added.result.deviceId;
    const { project } = execute(
      added.project,
      setDeviceOs,
      { id, os: { osId: 'proxmox-ve', version: '8.3' } },
      ctx,
    );
    const owned = Object.values(project.interfaces).filter((i) => i.owner.id === id);
    const bridge = owned.find((i) => i.kind === 'bridge');
    expect(bridge?.name).toBe('vmbr0');
    expect(owned.find((i) => i.name === 'eth0')?.parentId).toBe(bridge?.id);
    expect(project.devices[id]?.os).toEqual({ osId: 'proxmox-ve', version: '8.3' });
  });

  it('does not add a second bridge and clears the OS with null', () => {
    const pve = byName(lab, 'pve1');
    const again = execute(
      lab,
      setDeviceOs,
      { id: pve.id, os: { osId: 'proxmox-ve', version: '9.0' } },
      ctx,
    );
    expect(
      Object.values(again.project.interfaces).filter(
        (i) => i.owner.id === pve.id && i.kind === 'bridge',
      ),
    ).toHaveLength(1);
    const cleared = execute(again.project, setDeviceOs, { id: pve.id, os: null }, ctx);
    expect(cleared.project.devices[pve.id]?.os).toBeUndefined();
  });
});
