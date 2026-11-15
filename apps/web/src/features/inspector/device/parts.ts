import type {
  CatalogCpu,
  CatalogGpu,
  CpuSpec,
  Disk,
  GpuSpec,
  MemoryModule,
  MemorySpec,
} from '@server-planner/model';

/**
 * HW-09 predefined parts for the Hardware tab. CPUs and GPUs come from the catalog (copied into
 * the project like device models); RAM kits and disks are common configurations built in here.
 */

const GiB = 1024 ** 3;

export interface RamPreset {
  id: string;
  type: NonNullable<MemorySpec['type']>;
  module: MemoryModule;
}

const kit = (type: RamPreset['type'], speedMts: number, sizesGiB: number[], counts: number[]) =>
  sizesGiB.flatMap((size) =>
    counts.map(
      (count): RamPreset => ({
        id: `${type}-${speedMts}-${count}x${size}`,
        type,
        module: { sizeBytes: size * GiB, count, speedMts },
      }),
    ),
  );

export const RAM_PRESETS: RamPreset[] = [
  ...kit('DDR3', 1600, [4, 8], [1, 2, 4]),
  ...kit('DDR4', 2666, [8, 16, 32], [1, 2]),
  ...kit('DDR4', 3200, [8, 16, 32], [1, 2]),
  ...kit('DDR5', 4800, [16, 32], [1, 2]),
  ...kit('DDR5', 5600, [16, 32, 48], [1, 2]),
];

export interface DiskPreset {
  id: string;
  type: Disk['type'];
  sizeBytes: number;
}

const disks = (type: Disk['type'], sizesGB: number[]) =>
  sizesGB.map((gb): DiskPreset => ({ id: `${type}-${gb}`, type, sizeBytes: gb * 1e9 }));

/** Disks are sold in decimal units (1 TB = 10^12 bytes). */
export const DISK_PRESETS: DiskPreset[] = [
  ...disks('ssd-nvme', [256, 512, 1000, 2000, 4000]),
  ...disks('ssd-sata', [500, 1000, 2000, 4000]),
  ...disks('hdd', [2000, 4000, 8000, 12000, 16000, 20000, 24000]),
  ...disks('emmc', [32, 64, 128]),
  ...disks('sd', [32, 64, 128]),
];

/** A catalog CPU as copied into a device (with its catalog reference). */
export function cpuFromCatalog(cpu: CatalogCpu, catalogVersion: string): CpuSpec {
  const { id, vendor: _vendor, source: _source, confidence: _confidence, ...spec } = cpu;
  return { ...spec, catalogRef: { id, version: catalogVersion } };
}

export function gpuFromCatalog(gpu: CatalogGpu): GpuSpec {
  return {
    model: gpu.model,
    features: [...gpu.features],
    ...(gpu.vramBytes !== undefined ? { vramBytes: gpu.vramBytes } : {}),
  };
}

/** Vendor first, then model — the order of the pick lists. */
export const byVendorAndModel = <T extends { vendor: string; model: string }>(a: T, b: T) =>
  a.vendor.localeCompare(b.vendor) || a.model.localeCompare(b.model, 'en', { numeric: true });
