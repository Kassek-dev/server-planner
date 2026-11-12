import { describe, expect, it } from 'vitest';
import { cableLabel, createId, execute, labelCables, type ModelContext, shortPort } from '../src';
import { buildHomeLab } from './support/home-lab';

const ctx: ModelContext = { createId, now: () => '2026-11-12T08:00:00.000Z' };

describe('cable labels (LBL-03)', () => {
  it('shortens port names', () => {
    expect(shortPort('Port 5')).toBe('P05');
    expect(shortPort('eth0')).toBe('ETH0');
    expect(shortPort('lan0.20')).toBe('LAN0.20');
  });

  it('labels every cable once, ordered by device name', () => {
    const lab = buildHomeLab();
    const { project, result } = execute(lab, labelCables, {}, ctx);
    const cables = Object.values(project.links).filter(
      (l) => l.medium !== 'wifi' && l.medium !== 'virtual',
    );
    expect(result).toBe(cables.length);
    const nas = Object.values(project.links).find((l) =>
      [l.a, l.b].some(
        (i) =>
          project.interfaces[i]?.owner.id ===
          Object.values(project.devices).find((d) => d.name === 'nas-01')?.id,
      ),
    );
    expect(nas?.cable?.label).toMatch(/^NAS-01-ETH\d ↔ SW-CORE-P\d\d$/);
    // A second run keeps existing labels.
    expect(execute(project, labelCables, {}, ctx).result).toBe(0);
    if (!nas) throw new Error('no nas link');
    expect(cableLabel(project, nas, '{b.device}/{b.port}')).toMatch(/^SW-CORE\/P\d\d$/);
  });
});
