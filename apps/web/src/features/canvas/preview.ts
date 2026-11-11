import type { Project } from '@server-planner/model';
import { type CanvasNode, toFlowNodes } from './graph';

/** Project card thumbnail (PRJ-02): absolute rectangles of locations and devices, normalised. */
export interface ProjectPreview {
  w: number;
  h: number;
  items: {
    x: number;
    y: number;
    w: number;
    h: number;
    kind: 'rack' | 'shelf' | 'room' | 'device';
  }[];
}

const MAX_ITEMS = 80;

export function projectPreview(project: Project): ProjectPreview | undefined {
  const nodes = toFlowNodes(project);
  if (nodes.length === 0) return undefined;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const absolute = (n: CanvasNode): { x: number; y: number } => {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    const base = parent ? absolute(parent) : { x: 0, y: 0 };
    return { x: base.x + n.position.x, y: base.y + n.position.y };
  };
  const items = nodes.slice(0, MAX_ITEMS).map((n) => {
    const { x, y } = absolute(n);
    const size = n.data.size;
    const kind = n.type === 'location' ? n.data.location.kind : 'device';
    return { x, y, w: size.w, h: size.h, kind } as ProjectPreview['items'][number];
  });
  const minX = Math.min(...items.map((i) => i.x));
  const minY = Math.min(...items.map((i) => i.y));
  const maxX = Math.max(...items.map((i) => i.x + i.w));
  const maxY = Math.max(...items.map((i) => i.y + i.h));
  const round = (v: number) => Math.round(v);
  return {
    w: round(maxX - minX),
    h: round(maxY - minY),
    items: items.map((i) => ({
      ...i,
      x: round(i.x - minX),
      y: round(i.y - minY),
      w: round(i.w),
      h: round(i.h),
    })),
  };
}
