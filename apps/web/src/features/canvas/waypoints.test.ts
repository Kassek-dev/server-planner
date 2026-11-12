import { Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { alignmentGuides, cablePath, insertionIndex } from './waypoints';

describe('cable geometry (CAN-08)', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 50 },
    { x: 200, y: 200 },
  ];

  it('draws a straight polyline through the bend points', () => {
    expect(cablePath(points, 'straight', Position.Right, Position.Left)).toBe(
      'M 0,0 L 100,50 L 200,200',
    );
  });

  it('turns once per segment, following the handle axis at both ends', () => {
    // Leaves the right handle horizontally; enters the left handle horizontally (vertical first).
    expect(cablePath(points, 'orthogonal', Position.Right, Position.Left)).toBe(
      'M 0,0 L 100,0 L 100,50 L 100,200 L 200,200',
    );
    // Leaves the bottom handle vertically; enters the top handle vertically (horizontal first).
    expect(cablePath(points, 'orthogonal', Position.Bottom, Position.Top)).toBe(
      'M 0,0 L 0,50 L 100,50 L 200,50 L 200,200',
    );
  });

  it('inserts a clicked point into the nearest segment', () => {
    expect(insertionIndex(points, { x: 40, y: 22 })).toBe(0);
    expect(insertionIndex(points, { x: 160, y: 140 })).toBe(1);
  });
});

describe('alignment guides (CAN-08)', () => {
  it('shows a vertical guide for aligned left edges and a horizontal one for centres', () => {
    const moving = { x: 100, y: 200, w: 80, h: 40 };
    const others = [
      { x: 100, y: 0, w: 120, h: 60 },
      { x: 400, y: 190, w: 60, h: 60 },
    ];
    expect(alignmentGuides(moving, others)).toEqual([
      { axis: 'x', at: 100, from: 0, to: 240 },
      { axis: 'y', at: 220, from: 100, to: 460 },
    ]);
  });

  it('shows nothing when nothing lines up', () => {
    expect(alignmentGuides({ x: 5, y: 5, w: 10, h: 10 }, [{ x: 50, y: 50, w: 7, h: 7 }])).toEqual(
      [],
    );
  });
});
