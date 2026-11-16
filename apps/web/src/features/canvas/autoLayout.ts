import type { Project } from '@server-planner/model';
import { deviceSize, locationSize, toGrid, toPx } from './geometry';

/**
 * CAN-10 auto-layout: the lab drawn top-down from the Internet — routers, then switches, then
 * hosts and clients — by cable distance (BFS over physical links and Wi-Fi). What moves are the
 * top-level locations (with everything in them) and free-standing devices; within a row items are
 * ordered by the position of what they hang from, which keeps crossings down. Grid units out.
 */

export interface AutoLayout {
  devices: { id: string; x: number; y: number }[];
  locations: { id: string; rect: { x: number; y: number; w: number; h: number } }[];
}

const GAP_X = toPx(3);
const GAP_Y = toPx(5);

interface Item {
  id: string;
  kind: 'device' | 'location';
  name: string;
  w: number;
  h: number;
  depth: number;
  /** Devices this item contains (itself for a device). */
  members: Set<string>;
}

/** Cable distance of every device from the Internet (or the routers when there is none). */
export function deviceDepths(project: Project): Map<string, number> {
  const ownerOf = (ifaceId: string) => {
    const owner = project.interfaces[ifaceId]?.owner;
    if (!owner) return undefined;
    if (owner.type === 'device') return owner.id;
    // A VM's virtual NIC hangs off its host.
    let ref = project.workloads[owner.id]?.host;
    for (let i = 0; ref && i < 8; i += 1) {
      if (ref.type === 'device') return ref.id;
      ref = project.workloads[ref.id]?.host;
    }
    return undefined;
  };
  const neighbours = new Map<string, Set<string>>();
  for (const link of Object.values(project.links)) {
    if (link.medium === 'virtual') continue;
    const a = ownerOf(link.a);
    const b = ownerOf(link.b);
    if (!a || !b || a === b) continue;
    neighbours.set(a, (neighbours.get(a) ?? new Set()).add(b));
    neighbours.set(b, (neighbours.get(b) ?? new Set()).add(a));
  }
  const devices = Object.values(project.devices);
  let roots = devices.filter((d) => d.kind === 'internet').map((d) => d.id);
  if (roots.length === 0)
    roots = devices.filter((d) => d.kind === 'router' || d.kind === 'firewall').map((d) => d.id);
  if (roots.length === 0 && devices[0]) roots = [devices[0].id];
  const depth = new Map<string, number>(roots.map((id) => [id, 0]));
  const queue = [...roots];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const next of neighbours.get(id) ?? []) {
      if (depth.has(next)) continue;
      depth.set(next, (depth.get(id) ?? 0) + 1);
      queue.push(next);
    }
  }
  // Devices without a cable path go below everything else.
  const last = Math.max(0, ...depth.values()) + 1;
  for (const d of devices) if (!depth.has(d.id)) depth.set(d.id, last);
  return depth;
}

export function autoLayout(project: Project): AutoLayout {
  const depth = deviceDepths(project);
  const locations = Object.values(project.locations);
  const topOf = (locationId: string): string => {
    let current = project.locations[locationId];
    for (let i = 0; current?.parentId && project.locations[current.parentId] && i < 8; i += 1)
      current = project.locations[current.parentId];
    return current?.id ?? locationId;
  };
  const items = new Map<string, Item>();
  for (const location of locations) {
    if (location.parentId && project.locations[location.parentId]) continue;
    const rect = project.layout.locations[location.id]?.rect ?? { x: 0, y: 0, w: 12, h: 8 };
    const size = locationSize(location, rect);
    items.set(location.id, {
      id: location.id,
      kind: 'location',
      name: location.name,
      w: size.w,
      h: size.h,
      depth: Number.POSITIVE_INFINITY,
      members: new Set(),
    });
  }
  for (const device of Object.values(project.devices)) {
    const placed = device.placement && project.locations[device.placement.locationId];
    if (placed) {
      const item = items.get(topOf(placed.id));
      if (item) {
        item.members.add(device.id);
        item.depth = Math.min(item.depth, depth.get(device.id) ?? 0);
      }
      continue;
    }
    const size = deviceSize(device);
    items.set(device.id, {
      id: device.id,
      kind: 'device',
      name: device.name,
      w: size.w,
      h: size.h,
      depth: depth.get(device.id) ?? 0,
      members: new Set([device.id]),
    });
  }
  // Empty locations go last.
  const maxDepth = Math.max(0, ...[...items.values()].map((i) => i.depth).filter(Number.isFinite));
  for (const item of items.values()) if (!Number.isFinite(item.depth)) item.depth = maxDepth + 1;

  // Which item holds each device, and the cables between items.
  const holder = new Map<string, Item>();
  for (const item of items.values()) for (const d of item.members) holder.set(d, item);
  const rows = [...new Set([...items.values()].map((i) => i.depth))].sort((a, b) => a - b);
  const centreX = new Map<string, number>();
  const placedRows: Item[][] = [];
  for (const row of rows) {
    const list = [...items.values()].filter((i) => i.depth === row);
    // Barycentre of the items above that each item is cabled to.
    const parentsX = (item: Item) => {
      const xs: number[] = [];
      for (const link of Object.values(project.links)) {
        const a = project.interfaces[link.a]?.owner.id;
        const b = project.interfaces[link.b]?.owner.id;
        for (const [mine, other] of [
          [a, b],
          [b, a],
        ]) {
          if (!mine || !other || !item.members.has(mine)) continue;
          const x = centreX.get(holder.get(other)?.id ?? '');
          if (x !== undefined) xs.push(x);
        }
      }
      return xs.length > 0 ? xs.reduce((s, v) => s + v, 0) / xs.length : Number.POSITIVE_INFINITY;
    };
    const keyed = list.map((item) => ({ item, key: parentsX(item) }));
    keyed.sort((p, q) => p.key - q.key || p.item.name.localeCompare(q.item.name));
    placedRows.push(keyed.map((k) => k.item));
    // Provisional centres for the next row (the final x comes after centring).
    let x = 0;
    for (const { item } of keyed) {
      centreX.set(item.id, x + item.w / 2);
      x += item.w + GAP_X;
    }
  }
  const widths = placedRows.map((r) => r.reduce((s, i) => s + i.w, 0) + GAP_X * (r.length - 1));
  const widest = Math.max(0, ...widths);
  const out: AutoLayout = { devices: [], locations: [] };
  let y = toPx(2);
  placedRows.forEach((row, index) => {
    let x = toPx(2) + (widest - (widths[index] ?? 0)) / 2;
    const height = Math.max(0, ...row.map((i) => i.h));
    for (const item of row) {
      const gx = toGrid(x);
      const gy = toGrid(y);
      if (item.kind === 'device') out.devices.push({ id: item.id, x: gx, y: gy });
      else {
        const rect = project.layout.locations[item.id]?.rect ?? { x: 0, y: 0, w: 12, h: 8 };
        out.locations.push({ id: item.id, rect: { ...rect, x: gx, y: gy } });
      }
      x += item.w + GAP_X;
    }
    y += height + GAP_Y;
  });
  return out;
}
