import { createDevice } from '../factories';
import type { Device, DeviceKind } from '../schema/device';
import type { Placement } from '../schema/location';
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
