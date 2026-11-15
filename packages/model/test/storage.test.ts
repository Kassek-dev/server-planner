import { describe, expect, it } from 'vitest';
import { defaultPoolLayout, POOL_MIN_DISKS } from '../src';

describe('storage pool layouts', () => {
  it('suggests a layout by disk count', () => {
    expect([1, 2, 3, 5, 6, 8].map((n) => defaultPoolLayout(n))).toEqual([
      'single',
      'mirror',
      'raidz1',
      'raidz1',
      'raidz2',
      'raidz2',
    ]);
    expect(defaultPoolLayout(4, false)).toBe('raid5');
  });

  it('every suggestion meets its minimum disk count', () => {
    for (let n = 1; n <= 12; n += 1)
      for (const zfs of [true, false])
        expect(n).toBeGreaterThanOrEqual(POOL_MIN_DISKS[defaultPoolLayout(n, zfs)]);
  });
});
