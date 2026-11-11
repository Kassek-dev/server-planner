import type { Device, Location, Rack } from '@server-planner/model';
import { deviceUnits } from '@server-planner/model';

/** Canvas geometry — docs/04 § 4.3 (grid, rack units) and § 6.7 (tile sizes). All px at zoom 100%. */

export const GRID = 16;
export const RACK_U = 26;
export const RACK_HEADER = 28;
export const RACK_RAIL = 24;
export const RACK_PADDING = 8;
export const LOCATION_HEADER = 28;
export const SHELF_CHIP = { w: 96, h: 18, gap: 6 };

export interface Size {
  w: number;
  h: number;
}

export const toPx = (units: number) => units * GRID;
export const toGrid = (px: number) => Math.round(px / GRID);

export function rackHeight(rack: Rack): number {
  return RACK_HEADER + rack.units * RACK_U + RACK_PADDING;
}

export function locationSize(location: Location, rect: { w: number; h: number }): Size {
  const w = Math.max(toPx(rect.w), location.kind === 'rack' ? 200 : 160);
  return { w, h: location.kind === 'rack' ? rackHeight(location) : Math.max(toPx(rect.h), 96) };
}

/** Top of the row that holds unit `topU` (rack units count from the bottom). */
export function rackRowTop(rack: Rack, topU: number): number {
  return RACK_HEADER + (rack.units - topU) * RACK_U;
}

/** Lowest unit for a device whose top edge is at `y` (relative to the rack) and that is `units` tall. */
export function unitAtY(rack: Rack, y: number, units: number): number {
  const row = Math.round((y - RACK_HEADER) / RACK_U);
  const topU = rack.units - row;
  return Math.min(Math.max(topU - units + 1, 1), rack.units);
}

export function rackDeviceRect(rack: Rack, rackWidth: number, device: Device, u: number) {
  const units = deviceUnits(device);
  return {
    x: RACK_RAIL + 4,
    y: rackRowTop(rack, u + units - 1) + 1,
    w: rackWidth - RACK_RAIL - 4 - RACK_PADDING,
    h: units * RACK_U - 2,
  };
}

/** Tile size by form factor (outside racks). */
export function deviceSize(device: Device): Size {
  if (device.kind === 'internet') return { w: 144, h: 40 };
  const ff = device.formFactor;
  if (ff?.mount === 'rack') return { w: 240, h: Math.max(46, ff.units * 22 + 24) };
  if (ff?.shape === 'ceiling') return { w: 160, h: 48 };
  if (device.kind === 'client') return { w: 144, h: 52 };
  return { w: 216, h: 72 };
}
