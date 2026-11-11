import type { Device } from './schema/device';
import type { Rack } from './schema/location';
import type { Project } from './schema/project';

/** Rack geometry and fit checks (LOC-04/05) — shared by drop handling and validation. */

export interface RackSlot {
  /** Device ID, or `shelf:<u>` for a rack shelf. */
  occupant: string;
  from: number;
  to: number;
}

export type RackFit =
  | { ok: true; u: number; onShelf: boolean }
  | {
      ok: false;
      code:
        | 'NOT_A_RACK'
        | 'DEVICE_NOT_PLACEABLE'
        | 'RACK_UNIT_OUT_OF_RANGE'
        | 'RACK_UNITS_OCCUPIED'
        | 'RACK_WIDTH'
        | 'RACK_NO_SHELF';
      params: Record<string, string | number>;
    };

export function rackOf(project: Project, rackId: string): Rack | undefined {
  const location = project.locations[rackId];
  return location?.kind === 'rack' ? location : undefined;
}

/** Height in units of a device mounted directly in a rack (standalone devices sit on shelves). */
export function deviceUnits(device: Device): number {
  return device.formFactor?.mount === 'rack' ? device.formFactor.units : 1;
}

/** Occupied unit ranges: rack-mount devices and shelves (devices on shelves use the shelf). */
export function rackOccupancy(project: Project, rackId: string): RackSlot[] {
  const rack = rackOf(project, rackId);
  if (!rack) return [];
  const slots: RackSlot[] = (rack.shelves ?? []).map((s) => ({
    occupant: `shelf:${s.u}`,
    from: s.u,
    to: s.u + s.units - 1,
  }));
  for (const device of Object.values(project.devices)) {
    const placement = device.placement;
    if (placement?.locationId !== rackId || placement.u === undefined || placement.onShelf)
      continue;
    slots.push({
      occupant: device.id,
      from: placement.u,
      to: placement.u + deviceUnits(device) - 1,
    });
  }
  return slots.sort((a, b) => a.from - b.from);
}

export function freeUnits(project: Project, rackId: string): number {
  const rack = rackOf(project, rackId);
  if (!rack) return 0;
  const used = new Set<number>();
  for (const slot of rackOccupancy(project, rackId)) {
    for (let u = slot.from; u <= slot.to; u += 1) used.add(u);
  }
  return rack.units - [...used].filter((u) => u >= 1 && u <= rack.units).length;
}

/** Can `deviceId` be mounted with its lowest unit at `u`? Rack-mount → own units; standalone → a shelf. */
export function checkRackFit(
  project: Project,
  deviceId: string,
  rackId: string,
  u: number,
): RackFit {
  const rack = rackOf(project, rackId);
  const device = project.devices[deviceId];
  if (!rack) return { ok: false, code: 'NOT_A_RACK', params: { rackId } };
  if (!device?.formFactor) return { ok: false, code: 'DEVICE_NOT_PLACEABLE', params: { deviceId } };

  const others = rackOccupancy(project, rackId).filter((s) => s.occupant !== deviceId);
  if (device.formFactor.mount === 'standalone') {
    const shelf = (rack.shelves ?? []).find((s) => u >= s.u && u < s.u + s.units);
    if (!shelf) return { ok: false, code: 'RACK_NO_SHELF', params: { u } };
    return { ok: true, u: shelf.u, onShelf: true };
  }

  const units = device.formFactor.units;
  if (device.formFactor.width === '19in' && rack.width === '10in') {
    return { ok: false, code: 'RACK_WIDTH', params: { device: device.name, rack: rack.name } };
  }
  if (u < 1 || u + units - 1 > rack.units) {
    return {
      ok: false,
      code: 'RACK_UNIT_OUT_OF_RANGE',
      params: { u, units, rackUnits: rack.units },
    };
  }
  const clash = others.find((s) => s.from <= u + units - 1 && s.to >= u);
  if (clash) return { ok: false, code: 'RACK_UNITS_OCCUPIED', params: { u, units } };
  return { ok: true, u, onShelf: false };
}

/** Closest unit to `preferredU` where the device fits, searching up and down alternately. */
export function nearestFreeU(
  project: Project,
  deviceId: string,
  rackId: string,
  preferredU: number,
): number | undefined {
  const rack = rackOf(project, rackId);
  if (!rack) return undefined;
  for (let d = 0; d <= rack.units; d += 1) {
    for (const u of d === 0 ? [preferredU] : [preferredU + d, preferredU - d]) {
      const fit = checkRackFit(project, deviceId, rackId, u);
      if (fit.ok) return fit.u;
      if (fit.code === 'RACK_WIDTH' || fit.code === 'DEVICE_NOT_PLACEABLE') return undefined;
    }
  }
  return undefined;
}
