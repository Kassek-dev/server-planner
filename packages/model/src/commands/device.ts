import { clone } from '../clone';
import { createDevice } from '../factories';
import type { Device, DeviceKind } from '../schema/device';
import type { Placement } from '../schema/location';
import type { Interface } from '../schema/network';
import type { Project } from '../schema/project';
import { removeDevice } from './cascade';
import { applyChanges, CommandError, defineCommand, getOrThrow } from './core';

/** Devices and their physical placement — docs/02 § 4, § 4.3; docs/05 § 4.2–4.3. */

export interface AddDevicePayload {
  kind: DeviceKind;
  name?: string;
  /** Canvas position in grid units (relative to the location when placed outside a rack). */
  position?: { x: number; y: number };
  placement?: Placement;
}

export const addDevice = defineCommand(
  'device.add',
  (draft, payload: AddDevicePayload, ctx): { deviceId: string; interfaceIds: string[] } => {
    if (
      payload.kind === 'internet' &&
      Object.values(draft.devices).some((d) => d.kind === 'internet')
    ) {
      throw new CommandError('INTERNET_EXISTS');
    }
    const { device, interfaces } = createDevice(draft, payload.kind, ctx, payload.name);
    draft.devices[device.id] = device;
    for (const iface of interfaces) draft.interfaces[iface.id] = iface;
    if (payload.placement) placeDevice.run(draft, { id: device.id, ...payload.placement }, ctx);
    if (payload.position && !(payload.placement && isRack(draft, payload.placement.locationId))) {
      draft.layout.nodes[device.id] = { ...payload.position };
    }
    return { deviceId: device.id, interfaceIds: interfaces.map((i) => i.id) };
  },
);

export type DeviceChanges = Partial<Omit<Device, 'id' | 'kind' | 'placement'>>;

export const updateDevice = defineCommand(
  'device.update',
  (draft, { id, changes }: { id: string; changes: DeviceChanges }) => {
    const device = getOrThrow(draft.devices, id, 'device');
    if (changes.name !== undefined && changes.name.trim() === '')
      throw new CommandError('NAME_REQUIRED');
    applyChanges(device, changes);
  },
);

export const deleteDevice = defineCommand('device.delete', (draft, { id }: { id: string }) => {
  getOrThrow(draft.devices, id, 'device');
  removeDevice(draft, id);
});

function isRack(draft: { locations: Record<string, { kind: string }> }, locationId: string) {
  return draft.locations[locationId]?.kind === 'rack';
}

/** `device.place` — membership comes from placement, never from canvas geometry (docs/02 § 4.3). */
export const placeDevice = defineCommand(
  'device.place',
  (draft, { id, locationId, u, onShelf }: { id: string } & Placement) => {
    const device = getOrThrow(draft.devices, id, 'device');
    const location = getOrThrow(draft.locations, locationId, 'location');
    if (!device.formFactor) throw new CommandError('DEVICE_NOT_PLACEABLE', { id });

    if (location.kind === 'rack') {
      if (u === undefined || !Number.isInteger(u) || u < 1) {
        throw new CommandError('RACK_UNIT_REQUIRED', { id, locationId });
      }
      if (device.formFactor.mount === 'standalone' && !onShelf) {
        throw new CommandError('RACK_STANDALONE_NEEDS_SHELF', { id, locationId });
      }
      device.placement = { locationId, u, ...(onShelf ? { onShelf: true } : {}) };
      // Position inside a rack is derived from the unit, not stored.
      delete draft.layout.nodes[id];
      return;
    }
    if (u !== undefined || onShelf)
      throw new CommandError('RACK_UNIT_OUTSIDE_RACK', { id, locationId });
    device.placement = { locationId };
  },
);

export const unplaceDevice = defineCommand(
  'device.unplace',
  (draft, { id, position }: { id: string; position?: { x: number; y: number } }) => {
    const device = getOrThrow(draft.devices, id, 'device');
    delete device.placement;
    if (position) draft.layout.nodes[id] = { ...position };
  },
);

/** `pve1` → `pve2`, `nas` → `nas-2`: next free name derived from the original. */
export function nextCopyName(project: Project, name: string): string {
  const taken = new Set(Object.values(project.devices).map((d) => d.name));
  const match = /^(.*?)(\d+)$/.exec(name);
  const base = match ? (match[1] ?? '') : `${name}-`;
  let n = match ? Number(match[2]) + 1 : 2;
  while (taken.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

/**
 * `device.duplicate` (CAN-03): copies the device with its ports and hardware but without
 * cables, IP addresses, workloads or apps. Copies of rack devices are placed next to the rack.
 */
export const duplicateDevice = defineCommand(
  'device.duplicate',
  (
    draft,
    { id, offset = { x: 2, y: 2 } }: { id: string; offset?: { x: number; y: number } },
    ctx,
  ): string => {
    const source = getOrThrow(draft.devices, id, 'device');
    if (source.kind === 'internet') throw new CommandError('INTERNET_EXISTS');
    const copyId = ctx.createId('device');
    const diskIds = new Map(
      source.hardware.disks.map((d) => [d.id, ctx.createId('disk')] as const),
    );
    const copy: Device = {
      ...clone(source),
      id: copyId,
      name: nextCopyName(draft, source.name),
      hardware: {
        ...clone(source.hardware),
        disks: source.hardware.disks.map((d) => ({ ...clone(d), id: diskIds.get(d.id) ?? d.id })),
        pools: source.hardware.pools.map((p) => ({
          ...clone(p),
          id: ctx.createId('storagePool'),
          diskIds: p.diskIds.map((d) => diskIds.get(d) ?? d),
        })),
      },
    };
    delete copy.hostname;
    const inRack =
      source.placement && draft.locations[source.placement.locationId]?.kind === 'rack';
    if (inRack) delete copy.placement;
    draft.devices[copyId] = copy;

    const interfaceIds = new Map<string, string>();
    const owned = Object.values(draft.interfaces).filter(
      (i) => i.owner.type === 'device' && i.owner.id === id,
    );
    for (const iface of owned) interfaceIds.set(iface.id, ctx.createId('interface'));
    for (const iface of owned) {
      const newId = interfaceIds.get(iface.id) ?? iface.id;
      const next: Interface = {
        ...clone(iface),
        id: newId,
        owner: { type: 'device', id: copyId },
        addresses: [],
      };
      if (iface.parentId !== undefined) {
        const parent = interfaceIds.get(iface.parentId);
        if (parent) next.parentId = parent;
        else delete next.parentId;
      }
      delete next.mac;
      draft.interfaces[newId] = next;
    }

    const rackRect =
      inRack && source.placement
        ? draft.layout.locations[source.placement.locationId]?.rect
        : undefined;
    const base = rackRect
      ? { x: rackRect.x + rackRect.w + 2, y: rackRect.y }
      : (draft.layout.nodes[id] ?? { x: 0, y: 0 });
    draft.layout.nodes[copyId] = { x: base.x + offset.x, y: base.y + offset.y };
    return copyId;
  },
);
