import type { CapacityReport, ReachabilityResult, UsageStatus } from '@server-planner/engine';
import type { Project } from '@server-planner/model';
import type { Edge } from '@xyflow/react';
import { create } from 'zustand';
import { type CanvasNode, colorOf, type LinkEdgeData } from './graph';

/**
 * Canvas overlays (CAN-06, docs/05 § 4): link color by type or speed, device outline by zone,
 * tag or capacity status, and the simulation path (docs/04 § 6.10). Pure decoration of the
 * derived React Flow elements — the project is never touched.
 */

export type LinkColoring = 'type' | 'speed';
export type DeviceColoring = 'none' | 'zone' | 'tag' | 'capacity';

export interface CanvasViewState {
  links: LinkColoring;
  devices: DeviceColoring;
  /** CAN-09 minimap in the corner of the canvas. */
  minimap: boolean;
  set(changes: Partial<Pick<CanvasViewState, 'links' | 'devices'>>): void;
}

export const useCanvasView = create<CanvasViewState>((set) => ({
  links: 'type',
  devices: 'none',
  minimap: false,
  set: (changes) => set(changes),
}));

/** Speed classes for the legend and link styles, slowest first. */
export const SPEED_CLASSES = [
  { id: 'slow', max: 999, stroke: 'var(--sp-text-muted)', width: 2 },
  { id: 'gigabit', max: 1000, stroke: 'var(--sp-status-info)', width: 3 },
  { id: 'multi', max: 9999, stroke: 'var(--sp-status-ok)', width: 3 },
  { id: 'ten', max: Number.POSITIVE_INFINITY, stroke: 'var(--sp-accent)', width: 4 },
] as const;

export function linkSpeed(project: Project, link: { a: string; b: string }): number | undefined {
  const speeds = [
    project.interfaces[link.a]?.speedMbps,
    project.interfaces[link.b]?.speedMbps,
  ].filter((s): s is number => s !== undefined);
  return speeds.length > 0 ? Math.min(...speeds) : undefined;
}

const STATUS_COLOR: Record<UsageStatus, string> = {
  ok: 'var(--sp-status-ok)',
  warning: 'var(--sp-status-warning)',
  critical: 'var(--sp-status-error)',
  over: 'var(--sp-status-error)',
};
const RANK: Record<UsageStatus, number> = { ok: 0, warning: 1, critical: 2, over: 3 };

function worstStatus(report: CapacityReport): UsageStatus {
  return [report.cpu, report.memory, ...report.storage]
    .map((u) => u.status)
    .reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok' as UsageStatus);
}

/** Single internal zone of a device (via its interfaces); undefined when none or ambiguous. */
export function deviceZone(project: Project, deviceId: string): string | undefined {
  const zones = new Set<string>();
  for (const iface of Object.values(project.interfaces)) {
    if (iface.owner.type !== 'device' || iface.owner.id !== deviceId) continue;
    const subnet = iface.addresses
      .map((a) => (a.subnetId ? project.subnets[a.subnetId] : undefined))
      .find(Boolean);
    const zone = iface.zoneId ?? subnet?.zoneId;
    if (zone && project.zones[zone]?.kind !== 'wan') zones.add(zone);
  }
  return zones.size === 1 ? [...zones][0] : undefined;
}

export function deviceColor(
  project: Project,
  deviceId: string,
  coloring: DeviceColoring,
  capacity: Record<string, CapacityReport> | undefined,
): string | undefined {
  switch (coloring) {
    case 'zone': {
      const zone = deviceZone(project, deviceId);
      return colorOf(zone ? project.zones[zone]?.color : undefined);
    }
    case 'tag': {
      const tag = project.devices[deviceId]?.tagIds.map((id) => project.tags[id]).find(Boolean);
      return colorOf(tag?.color);
    }
    case 'capacity': {
      const report = capacity?.[deviceId];
      return report ? STATUS_COLOR[worstStatus(report)] : undefined;
    }
    default:
      return undefined;
  }
}

export interface OverlayInput {
  project: Project;
  view: Pick<CanvasViewState, 'links' | 'devices'>;
  capacity?: Record<string, CapacityReport> | undefined;
  highlight?: ReachabilityResult | null;
}

/** Device of the failing step and the link it refused, if the result is blocked. */
function blockedAt(project: Project, result: ReachabilityResult) {
  const step = result.blockedAt === undefined ? undefined : result.steps[result.blockedAt];
  if (!step) return {};
  if (step.ref.type === 'device') return { device: step.ref.id };
  if (step.ref.type === 'interface') {
    const iface = project.interfaces[step.ref.id];
    const link = result.path.links.find((id) => {
      const l = project.links[id];
      return l && (l.a === step.ref.id || l.b === step.ref.id);
    });
    return {
      ...(iface?.owner.type === 'device' ? { device: iface.owner.id } : {}),
      ...(link ? { link } : {}),
    };
  }
  return {};
}

export function decorateNodes(nodes: CanvasNode[], input: OverlayInput): CanvasNode[] {
  const { project, view, capacity, highlight } = input;
  if (highlight) {
    const onPath = new Set(highlight.path.devices);
    const blocked = blockedAt(project, highlight).device;
    return nodes.map((n) => {
      if (n.type !== 'device') return n;
      const className = n.id === blocked ? 'sp-blocked' : onPath.has(n.id) ? 'sp-path' : 'sp-dim';
      return { ...n, className } as CanvasNode;
    });
  }
  if (view.devices === 'none') return nodes;
  return nodes.map((n) => {
    if (n.type !== 'device') return n;
    const color = deviceColor(project, n.id, view.devices, capacity);
    return color
      ? ({
          ...n,
          style: { ...n.style, outline: `3px solid ${color}`, outlineOffset: 2 },
        } as CanvasNode)
      : n;
  });
}

export function decorateEdges(
  edges: Edge<LinkEdgeData>[],
  input: OverlayInput,
): Edge<LinkEdgeData>[] {
  const { project, view, highlight } = input;
  if (highlight) {
    const onPath = new Set(highlight.path.links);
    const blocked = blockedAt(project, highlight).link;
    return edges.map((e) => ({
      ...e,
      className: e.id === blocked ? 'sp-blocked' : onPath.has(e.id) ? 'sp-flow' : 'sp-dim',
    }));
  }
  if (view.links !== 'speed') return edges;
  return edges.map((e) => {
    const speed = e.data ? linkSpeed(project, e.data.link) : undefined;
    const cls = speed === undefined ? undefined : SPEED_CLASSES.find((c) => speed <= c.max);
    return {
      ...e,
      style: {
        ...e.style,
        stroke: cls?.stroke ?? 'var(--sp-border-strong)',
        strokeWidth: cls?.width ?? 2,
        strokeDasharray: speed === undefined ? '2 4' : 'none',
      },
    };
  });
}
