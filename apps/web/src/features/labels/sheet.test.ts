import { describe, expect, it } from 'vitest';
import { homeLab } from '../canvas/testSupport';
import {
  FLAG_WRAP,
  layoutSheets,
  layoutTape,
  projectLabels,
  SHEET_PRESETS,
  tapeLength,
  tapeStrip,
} from './sheet';

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

  it('lays labels on tape as long as their text, flags twice plus the wrap (1.10)', () => {
    const cable = { title: 'pve1:eth0 ↔ sw-core:p3', detail: 'CAT6 · 2 m', kind: 'cable' as const };
    const device = { title: 'nas-01', detail: '', kind: 'device' as const };
    const plain = tapeLength(cable, 12, false);
    expect(tapeLength(cable, 12, true)).toBeCloseTo(2 * plain + FLAG_WRAP, 0);
    // Devices never become flags; short text keeps a minimum length.
    expect(tapeLength(device, 12, true)).toBe(tapeLength(device, 12, false));
    expect(tapeLength(device, 12, false)).toBeGreaterThanOrEqual(20);
    const strip = tapeStrip([cable, device], 12, true);
    expect(strip.labels[0]?.flag).toBe(true);
    expect(strip.labels[1]?.x).toBe(strip.labels[0]?.w);
    expect(strip.labels[1]?.flag).toBeUndefined();
    expect(strip.length).toBeCloseTo((strip.labels[0]?.w ?? 0) + (strip.labels[1]?.w ?? 0));
    // On paper: rows of tape inside the margins, a new page when full.
    const pages = layoutTape(
      Array.from({ length: 200 }, () => cable),
      24,
      true,
    );
    expect(pages.length).toBeGreaterThan(1);
    for (const l of pages.flat()) {
      expect(l.x + l.w).toBeLessThanOrEqual(200 + 1e-9);
      expect(l.y + l.h).toBeLessThanOrEqual(287 + 1e-9);
    }
  });

  it('marks cable labels as flags on a sheet when asked', () => {
    const labels = projectLabels(homeLab(), { cables: true, bothEnds: false, devices: true });
    const placed = layoutSheets(labels, SHEET_PRESETS[0] ?? (undefined as never), 0, true).flat();
    expect(placed.some((l) => l.flag)).toBe(true);
    expect(placed.filter((l) => l.kind === 'device').every((l) => !l.flag)).toBe(true);
  });
});
