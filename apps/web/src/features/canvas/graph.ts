import type { ColorRef, Device, Interface, Link, Location, Project } from '@server-planner/model';
import type { Edge, Node } from '@xyflow/react';
import {
  deviceSize,
  GRID,
  locationSize,
  RACK_RAIL,
  rackDeviceRect,
  rackRowTop,
  SHELF_CHIP,
  type Size,
  toPx,
} from './geometry';

/** Project → React Flow nodes/edges (docs/03 § 4.5). Pure: the store stays the source of truth. */

export type DeviceVariant = 'tile' | 'rack-row' | 'shelf-chip';

export interface DeviceNodeData extends Record<string, unknown> {
  device: Device;
  variant: DeviceVariant;
  ports: PortView[];
  size: Size;
}

export interface LocationNodeData extends Record<string, unknown> {
  location: Location;
  size: Size;
  freeUnits?: number;
  occupied?: { from: number; to: number }[];
}

export interface PortView {
  id: string;
  name: string;
  state: 'free' | 'access' | 'trunk' | 'wan' | 'wifi';
  color?: string;
}

export type CanvasNode = Node<DeviceNodeData, 'device'> | Node<LocationNodeData, 'location'>;

export const colorOf = (color: ColorRef | undefined): string | undefined =>
  color === undefined ? undefined : color.startsWith('#') ? color : `var(--sp-vlan-${color})`;

function linkedInterfaces(project: Project): Set<string> {
  const linked = new Set<string>();
  for (const link of Object.values(project.links)) {
    linked.add(link.a);
    linked.add(link.b);
  }
  return linked;
}

function portView(project: Project, iface: Interface, linked: Set<string>): PortView {
  const base = { id: iface.id, name: iface.name };
  if (!linked.has(iface.id)) return { ...base, state: 'free' };
  if (iface.kind === 'wan') return { ...base, state: 'wan' };
  if (iface.kind === 'wifi-radio') return { ...base, state: 'wifi' };
  const sp = iface.switchport;
  if (sp?.mode === 'trunk') return { ...base, state: 'trunk' };
  const vlan = sp?.accessVlanId ? project.vlans[sp.accessVlanId] : undefined;
  const color = colorOf(vlan?.color);
  return color ? { ...base, state: 'access', color } : { ...base, state: 'trunk' };
}

const PHYSICAL = new Set(['rj45', 'sfp', 'sfp+', 'sfp28', 'qsfp+', 'wan', 'wifi-radio']);

export function devicePorts(
  project: Project,
  deviceId: string,
  linked = linkedInterfaces(project),
): PortView[] {
  return Object.values(project.interfaces)
    .filter((i) => i.owner.type === 'device' && i.owner.id === deviceId && PHYSICAL.has(i.kind))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((i) => portView(project, i, linked));
}

/** Only room → rack/shelf nesting one level deep is drawn nested (cycle-safe for any input). */
function validParent(
  project: Project,
  location: Location,
): location is Location & { parentId: string } {
  if (location.parentId === undefined || location.kind === 'room') return false;
  const parent = project.locations[location.parentId];
  return parent?.kind === 'room' && parent.parentId === undefined;
}

/** Location nesting order: parents before children (React Flow requirement). */
function sortedLocations(project: Project): Location[] {
  return Object.values(project.locations).sort(
    (a, b) => Number(a.parentId !== undefined) - Number(b.parentId !== undefined),
  );
}

export function toFlowNodes(project: Project): CanvasNode[] {
  const nodes: CanvasNode[] = [];
  const linked = linkedInterfaces(project);
  const sizes = new Map<string, Size>();

  for (const location of sortedLocations(project)) {
    const rect = project.layout.locations[location.id]?.rect ?? { x: 0, y: 0, w: 12, h: 8 };
    const size = locationSize(location, rect);
    sizes.set(location.id, size);
    const occupied =
      location.kind === 'rack'
        ? Object.values(project.devices)
            .filter(
              (d) =>
                d.placement?.locationId === location.id &&
                d.placement.u !== undefined &&
                !d.placement.onShelf,
            )
            .map((d) => {
              const u = d.placement?.u ?? 1;
              return {
                from: u,
                to: u + (d.formFactor?.mount === 'rack' ? d.formFactor.units : 1) - 1,
              };
            })
            .concat((location.shelves ?? []).map((s) => ({ from: s.u, to: s.u + s.units - 1 })))
        : undefined;
    nodes.push({
      id: location.id,
      type: 'location',
      position: { x: toPx(rect.x), y: toPx(rect.y) },
      ...(validParent(project, location) ? { parentId: location.parentId } : {}),
      data: {
        location,
        size,
        ...(occupied
          ? {
              occupied,
              freeUnits:
                (location.kind === 'rack' ? location.units : 0) -
                usedUnits(occupied, location.kind === 'rack' ? location.units : 0).size,
            }
          : {}),
      },
      style: { width: size.w, height: size.h },
      zIndex: 0,
      selectable: true,
    });
  }

  const shelfChipIndex = new Map<string, number>();
  for (const device of Object.values(project.devices)) {
    const placement = device.placement;
    const location = placement ? project.locations[placement.locationId] : undefined;
    const ports = devicePorts(project, device.id, linked);
    const stored = project.layout.nodes[device.id];

    if (location?.kind === 'rack' && placement?.u !== undefined) {
      const rackSize = sizes.get(location.id) ?? { w: 240, h: 0 };
      if (placement.onShelf) {
        const key = `${location.id}:${placement.u}`;
        const index = shelfChipIndex.get(key) ?? 0;
        shelfChipIndex.set(key, index + 1);
        const size = { w: SHELF_CHIP.w, h: SHELF_CHIP.h };
        nodes.push({
          id: device.id,
          type: 'device',
          parentId: location.id,
          position: {
            x: RACK_RAIL + 8 + index * (SHELF_CHIP.w + SHELF_CHIP.gap),
            y: rackRowTop(location, placement.u) + 4,
          },
          data: { device, variant: 'shelf-chip', ports, size },
          style: { width: size.w, height: size.h },
          zIndex: 2,
        });
        continue;
      }
      const rect = rackDeviceRect(location, rackSize.w, device, placement.u);
      nodes.push({
        id: device.id,
        type: 'device',
        parentId: location.id,
        position: { x: rect.x, y: rect.y },
        data: { device, variant: 'rack-row', ports, size: { w: rect.w, h: rect.h } },
        style: { width: rect.w, height: rect.h },
        zIndex: 2,
      });
      continue;
    }

    const size = deviceSize(device);
    nodes.push({
      id: device.id,
      type: 'device',
      ...(location ? { parentId: location.id } : {}),
      position: { x: toPx(stored?.x ?? 1), y: toPx(stored?.y ?? 2) },
      data: { device, variant: 'tile', ports, size },
      style: { width: size.w, height: size.h },
      zIndex: 2,
    });
  }
  return nodes;
}

export interface LinkEdgeData extends Record<string, unknown> {
  link: Link;
}

/** Physical links only — vNIC ↔ bridge links are edited in the inspector (docs/02 § 6.1). */
export function toFlowEdges(
  project: Project,
  nodes: CanvasNode[] = toFlowNodes(project),
): Edge<LinkEdgeData>[] {
  const centers = absoluteCenters(nodes);
  const edges: Edge<LinkEdgeData>[] = [];
  for (const link of Object.values(project.links)) {
    if (link.medium === 'virtual') continue;
    const a = project.interfaces[link.a];
    const b = project.interfaces[link.b];
    if (!a || !b || a.owner.type !== 'device' || b.owner.type !== 'device') continue;
    edges.push({
      id: link.id,
      source: a.owner.id,
      target: b.owner.id,
      ...(sameRack(project, a.owner.id, b.owner.id)
        ? // Inside one rack the cable leaves on the right and comes back, clear of the U column.
          { sourceHandle: 'r', targetHandle: 'r' }
        : facingHandles(centers.get(a.owner.id), centers.get(b.owner.id))),
      type: 'step',
      data: { link },
      style: edgeStyle(project, link, a, b),
      zIndex: 1,
    });
  }
  return edges;
}

/** Rack of a device mounted in (or on a shelf of) a rack, if any. */
function rackOfDevice(project: Project, deviceId: string): string | undefined {
  const placement = project.devices[deviceId]?.placement;
  if (!placement || placement.u === undefined) return undefined;
  return project.locations[placement.locationId]?.kind === 'rack'
    ? placement.locationId
    : undefined;
}

export function sameRack(project: Project, a: string, b: string): boolean {
  const rack = rackOfDevice(project, a);
  return rack !== undefined && rack === rackOfDevice(project, b);
}

function absoluteCenters(nodes: CanvasNode[]): Map<string, { x: number; y: number }> {
  const origin = absoluteOrigin(nodes);
  return new Map(
    nodes.map((n) => {
      const o = origin(n);
      return [n.id, { x: o.x + n.data.size.w / 2, y: o.y + n.data.size.h / 2 }];
    }),
  );
}

/** Sides of two tiles that face each other: horizontal when they are side by side, else vertical. */
export function facingHandles(
  a: { x: number; y: number } | undefined,
  b: { x: number; y: number } | undefined,
): { sourceHandle: string; targetHandle: string } {
  if (!a || !b) return { sourceHandle: 'b', targetHandle: 't' };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy))
    return dx > 0
      ? { sourceHandle: 'r', targetHandle: 'l' }
      : { sourceHandle: 'l', targetHandle: 'r' };
  return dy > 0
    ? { sourceHandle: 'b', targetHandle: 't' }
    : { sourceHandle: 't', targetHandle: 'b' };
}

/** docs/04 § 6.6: access = VLAN color 3 px, trunk 4 px, WAN 2 px, Wi-Fi dashed in the SSID's VLAN color. */
export function edgeStyle(
  project: Project,
  link: Link,
  a: Interface,
  b: Interface,
): Record<string, string | number> {
  if (link.medium === 'wifi') {
    const ssid = [a, b]
      .map((i) => project.devices[i.owner.id]?.wifi?.ssids.find((s) => s.id === link.ssidId))
      .find(Boolean);
    const color = colorOf(ssid?.vlanId ? project.vlans[ssid.vlanId]?.color : undefined);
    return { stroke: color ?? 'var(--sp-border-strong)', strokeWidth: 2, strokeDasharray: '6 5' };
  }
  if (a.kind === 'wan' || b.kind === 'wan') return { stroke: 'var(--sp-port-wan)', strokeWidth: 2 };
  const modes = [a.switchport, b.switchport];
  if (modes.some((sp) => sp?.mode === 'trunk'))
    return { stroke: 'var(--sp-port-trunk)', strokeWidth: 4 };
  const vlanId = modes.find((sp) => sp?.accessVlanId)?.accessVlanId;
  const color = colorOf(vlanId ? project.vlans[vlanId]?.color : undefined);
  return { stroke: color ?? 'var(--sp-border-strong)', strokeWidth: 3 };
}

/** Absolute rectangles of locations, innermost last (for drop targeting and previews). */
export function absoluteLocationRects(
  project: Project,
): { id: string; kind: Location['kind']; x: number; y: number; w: number; h: number }[] {
  const nodes = toFlowNodes(project).filter((n) => n.type === 'location');
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const origin = absoluteOrigin(nodes);
  const absolute = (id: string) => {
    const n = byId.get(id);
    return n ? origin(n) : { x: 0, y: 0 };
  };
  return nodes
    .map((n) => {
      const data = n.data as LocationNodeData;
      return { id: n.id, kind: data.location.kind, ...absolute(n.id), ...data.size };
    })
    .sort((a, b) => Number(!!byId.get(a.id)?.parentId) - Number(!!byId.get(b.id)?.parentId));
}

/** Innermost location containing the point (flow coordinates). */
export function locationAt(project: Project, point: { x: number; y: number }, exclude?: string) {
  const hits = absoluteLocationRects(project).filter(
    (r) =>
      r.id !== exclude &&
      point.x >= r.x &&
      point.x <= r.x + r.w &&
      point.y >= r.y &&
      point.y <= r.y + r.h,
  );
  return hits.at(-1);
}

export { GRID };

/** Max parent chain walked when resolving absolute positions (valid nesting is ≤ 2 deep). */
const MAX_NESTING = 4;

/** Absolute top-left of a node, walking parents iteratively with a depth cap (cycle-safe). */
export function absoluteOrigin(nodes: CanvasNode[]): (n: CanvasNode) => { x: number; y: number } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (node) => {
    let x = 0;
    let y = 0;
    let current: CanvasNode | undefined = node;
    for (let depth = 0; current && depth <= MAX_NESTING; depth += 1) {
      x += current.position.x;
      y += current.position.y;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return { x, y };
  };
}

/** Units covered by the given ranges, clamped to 1..rackUnits so bad data cannot blow up memory. */
export function usedUnits(ranges: { from: number; to: number }[], rackUnits: number): Set<number> {
  const used = new Set<number>();
  for (const range of ranges) {
    for (let u = Math.max(1, range.from); u <= Math.min(rackUnits, range.to); u += 1) used.add(u);
  }
  return used;
}
