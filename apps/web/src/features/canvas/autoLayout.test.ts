import { describe, expect, it } from 'vitest';
import { autoLayout, deviceDepths } from './autoLayout';
import { deviceByName, homeLab } from './testSupport';

describe('auto-layout (CAN-10)', () => {
  const lab = homeLab();
  const depth = (name: string) => deviceDepths(lab).get(deviceByName(lab, name).id);

  it('measures cable distance from the Internet', () => {
    expect(depth('Internet')).toBe(0);
    expect(depth('gw-01')).toBe(1);
    expect(depth('sw-core')).toBe(2);
    expect(depth('pve1')).toBe(3);
    expect(depth('tv-salon')).toBeGreaterThan(depth('ap-living') ?? 0);
  });

  it('puts the Internet on top and the locations below, without overlaps', () => {
    const layout = autoLayout(lab);
    const internet = layout.devices.find((d) => d.id === deviceByName(lab, 'Internet').id);
    expect(internet).toBeDefined();
    for (const l of layout.locations) expect(l.rect.y).toBeGreaterThan(internet?.y ?? 0);
    // Rows do not overlap: locations in one row share their y.
    const ys = layout.locations.map((l) => l.rect.y);
    expect(new Set(ys).size).toBeLessThanOrEqual(layout.locations.length);
    const rect = (id: string) => layout.locations.find((l) => l.id === id)?.rect;
    const ids = layout.locations.map((l) => l.id);
    for (const a of ids)
      for (const b of ids) {
        if (a === b) continue;
        const p = rect(a);
        const q = rect(b);
        if (p && q && p.y === q.y) expect(p.x + p.w <= q.x || q.x + q.w <= p.x).toBe(true);
      }
  });
});
