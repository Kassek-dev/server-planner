import type { OsId, Resources } from '@server-planner/model';

const GiB = 1024 ** 3;

/**
 * Host OS overhead until the catalog provides it (CatalogOs.overhead, stage 7) — docs/02 § 9.4.
 * Values are conservative typical idle footprints.
 */
export const OS_OVERHEAD: Record<OsId, Resources> = {
  'proxmox-ve': { cpu: 0.5, memoryBytes: 1 * GiB, diskBytes: 16e9 },
  debian: { cpu: 0.1, memoryBytes: 0.25 * GiB, diskBytes: 4e9 },
  'ubuntu-server': { cpu: 0.2, memoryBytes: 0.5 * GiB, diskBytes: 6e9 },
  'windows-server': { cpu: 1, memoryBytes: 2 * GiB, diskBytes: 32e9 },
};
