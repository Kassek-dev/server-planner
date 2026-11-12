import { Position } from '@xyflow/react';

/** CAN-08 cable geometry: a polyline from the source handle through bend points to the target. */

export interface Point {
  x: number;
  y: number;
}

const vertical = (p: Position) => p === Position.Top || p === Position.Bottom;

/**
 * SVG path through `points` (source first, target last). Straight cables are a polyline; orthogonal
 * ones turn once per segment — leaving the source and entering the target along their handle axis.
 */
export function cablePath(
  points: Point[],
  routing: 'straight' | 'orthogonal',
  sourcePosition: Position,
  targetPosition: Position,
): string {
  const [first, ...rest] = points;
  if (!first) return '';
  let d = `M ${first.x},${first.y}`;
  rest.forEach((q, i) => {
    const p = points[i] as Point;
    if (routing === 'straight') {
      d += ` L ${q.x},${q.y}`;
      return;
    }
    const last = i === rest.length - 1;
    // Middle segments go horizontally first; the ends follow the handle they touch.
    const verticalFirst = i === 0 ? vertical(sourcePosition) : last && !vertical(targetPosition);
    d += verticalFirst ? ` L ${p.x},${q.y} L ${q.x},${q.y}` : ` L ${q.x},${p.y} L ${q.x},${q.y}`;
  });
  return d;
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Index in the bend point list where a point clicked on the cable belongs (nearest segment). */
export function insertionIndex(points: Point[], at: Point): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length - 1; i += 1) {
    const distance = distanceToSegment(at, points[i] as Point, points[i + 1] as Point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A helper line: vertical at `x` (or horizontal at `y`) spanning `from`..`to`. */
export type Guide =
  | { axis: 'x'; at: number; from: number; to: number }
  | { axis: 'y'; at: number; from: number; to: number };

/** Pixels within which edges or centres count as aligned. */
const TOLERANCE = 2;

/**
 * CAN-08 guides while dragging: the closest aligned edge or centre of another node, per axis.
 * Grid snapping already places nodes; the guides show what the dragged node lines up with.
 */
export function alignmentGuides(moving: Rect, others: Rect[]): Guide[] {
  const guides: Guide[] = [];
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'w' : 'h';
    const lines = (r: Rect) => [r[axis], r[axis] + r[size] / 2, r[axis] + r[size]];
    const mine = lines(moving);
    let best: { at: number; other: Rect; distance: number } | undefined;
    for (const other of others) {
      for (const a of mine)
        for (const b of lines(other)) {
          const distance = Math.abs(a - b);
          if (distance <= TOLERANCE && (!best || distance < best.distance))
            best = { at: b, other, distance };
        }
    }
    if (!best) continue;
    // The line runs across both nodes on the other axis.
    const cross = axis === 'x' ? 'y' : 'x';
    const crossSize = axis === 'x' ? 'h' : 'w';
    const from = Math.min(moving[cross], best.other[cross]);
    const to = Math.max(
      moving[cross] + moving[crossSize],
      best.other[cross] + best.other[crossSize],
    );
    guides.push({ axis, at: best.at, from, to });
  }
  return guides;
}
