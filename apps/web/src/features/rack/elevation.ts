import { deviceUnits, type Project, rackOf } from '@server-planner/model';

/**
 * LOC-09 rack elevation: the front of a rack, top unit first — mounted devices, shelves with what
 * stands on them, and runs of free units. Overlapping data (an issue elsewhere) keeps the first
 * occupant of a unit.
 */

export type ElevationItem =
  | { kind: 'device'; top: number; units: number; deviceId: string; name: string; detail: string }
  | { kind: 'shelf'; top: number; units: number; devices: string[] }
  | { kind: 'free'; top: number; units: number };

export interface Elevation {
  name: string;
  units: number;
  width: '10in' | '19in';
  items: ElevationItem[];
  freeUnits: number;
}

export function rackElevation(
  project: Project,
  rackId: string,
  /** Short description of a device (model or kind). */
  detailOf: (deviceId: string) => string = () => '',
): Elevation | undefined {
  const rack = rackOf(project, rackId);
  if (!rack) return undefined;
  const owner = new Map<number, ElevationItem>();
  const claim = (item: ElevationItem) => {
    const bottom = item.top - item.units + 1;
    for (let u = bottom; u <= item.top; u += 1)
      if (u >= 1 && u <= rack.units && !owner.has(u)) owner.set(u, item);
  };
  const devices = Object.values(project.devices).filter(
    (d) => d.placement?.locationId === rackId && d.placement.u !== undefined,
  );
  for (const d of devices.filter((x) => !x.placement?.onShelf)) {
    const units = deviceUnits(d);
    claim({
      kind: 'device',
      top: (d.placement?.u ?? 1) + units - 1,
      units,
      deviceId: d.id,
      name: d.name,
      detail: detailOf(d.id),
    });
  }
  for (const shelf of rack.shelves ?? []) {
    claim({
      kind: 'shelf',
      top: shelf.u + shelf.units - 1,
      units: shelf.units,
      devices: devices
        .filter((d) => d.placement?.onShelf && d.placement.u === shelf.u)
        .map((d) => d.name)
        .sort(),
    });
  }

  const items: ElevationItem[] = [];
  let freeUnits = 0;
  for (let u = rack.units; u >= 1; ) {
    const item = owner.get(u);
    if (item) {
      // An item listed once, at its top unit within the rack.
      items.push({ ...item, top: u, units: Math.min(item.units, u - (item.top - item.units)) });
      u = item.top - item.units;
      continue;
    }
    let count = 0;
    while (u - count >= 1 && !owner.has(u - count)) count += 1;
    items.push({ kind: 'free', top: u, units: count });
    freeUnits += count;
    u -= count;
  }
  return { name: rack.name, units: rack.units, width: rack.width, items, freeUnits };
}
