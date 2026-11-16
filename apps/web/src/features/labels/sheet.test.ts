import { describe, expect, it } from 'vitest';
import { homeLab } from '../canvas/testSupport';
import { layoutSheets, projectLabels, SHEET_PRESETS } from './sheet';

const preset = SHEET_PRESETS[0];

describe('label sheets (LBL-04)', () => {
  it('lists devices and each cable twice for both ends', () => {
    const lab = homeLab();
    const cables = Object.values(lab.links).filter(
      (l) => l.medium !== 'virtual' && l.medium !== 'wifi',
    ).length;
    const devices = Object.values(lab.devices).filter((d) => d.kind !== 'internet').length;
    const both = projectLabels(lab, { cables: true, bothEnds: true, devices: true });
    expect(both).toHaveLength(devices + 2 * cables);
    expect(projectLabels(lab, { cables: true, bothEnds: false, devices: false })).toHaveLength(
      cables,
    );
    expect(both.find((l) => l.title === 'gw-01')?.detail).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(both.some((l) => l.title.includes('↔'))).toBe(true);
  });

  it('fills sheets row by row, centred on A4, after skipped labels', () => {
    if (!preset) throw new Error('no preset');
    const labels = Array.from({ length: 30 }, (_, i) => ({ title: `L${i}`, detail: '' }));
    const sheets = layoutSheets(labels, preset, 2);
    expect(sheets.map((s) => s.length)).toEqual([22, 8]);
    // 70 × 37 mm, 3 × 8: the grid is 210 × 296 mm, 0.5 mm from the top.
    expect(sheets[0]?.[0]).toMatchObject({ title: 'L0', x: 140, y: 0.5 });
    expect(sheets[0]?.[1]).toMatchObject({ x: 0, y: 37.5 });
    expect(sheets[1]?.[0]).toMatchObject({ title: 'L22', x: 0, y: 0.5 });
  });
});
