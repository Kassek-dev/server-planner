import type { StoragePool } from './schema/hardware';

/** Storage pool rules shared by the inspector and the engine — docs/02 § 4.1. */

export type PoolLayout = StoragePool['layout'];

/** Fewest disks a layout works with (single: one disk; RAIDZ2: four; …). */
export const POOL_MIN_DISKS: Record<PoolLayout, number> = {
  single: 1,
  raid0: 2,
  mirror: 2,
  raid5: 3,
  raidz1: 3,
  raid6: 4,
  raidz2: 4,
  raid10: 4,
  raidz3: 5,
};

/** A sensible layout for a new pool of `count` disks (ZFS-style names when the pool is ZFS). */
export function defaultPoolLayout(count: number, zfs = true): PoolLayout {
  if (count <= 1) return 'single';
  if (count === 2) return 'mirror';
  if (count <= 5) return zfs ? 'raidz1' : 'raid5';
  return zfs ? 'raidz2' : 'raid6';
}
