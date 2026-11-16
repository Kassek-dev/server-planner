import type {
  CatalogCpu,
  CatalogGpu,
  CpuSpec,
  Disk,
  GpuSpec,
  Hardware,
  MemoryModule,
  MemorySpec,
  NewCard,
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
    attach: gpu.attach,
    ...(gpu.vramBytes !== undefined ? { vramBytes: gpu.vramBytes } : {}),
  };
}

/** Vendor first, then model — the order of the pick lists. */
export const byVendorAndModel = <T extends { vendor: string; model: string }>(a: T, b: T) =>
  a.vendor.localeCompare(b.vendor) || a.model.localeCompare(b.model, 'en', { numeric: true });

/** LIB-05 common add-in cards (configurations, like RAM kits — not catalog data). */
export interface CardPreset {
  id: string;
  card: NewCard;
}

export const CARD_PRESETS: CardPreset[] = [
  {
    id: 'intel-x520-da2',
    card: {
      kind: 'nic',
      model: 'Intel X520-DA2',
      slot: 'pcie',
      ports: { count: 2, kind: 'sfp+', speedMbps: 10000 },
    },
  },
  {
    id: 'intel-x710-da2',
    card: {
      kind: 'nic',
      model: 'Intel X710-DA2',
      slot: 'pcie',
      ports: { count: 2, kind: 'sfp+', speedMbps: 10000 },
    },
  },
  {
    id: 'intel-x540-t2',
    card: {
      kind: 'nic',
      model: 'Intel X540-T2',
      slot: 'pcie',
      ports: { count: 2, kind: 'rj45', speedMbps: 10000 },
    },
  },
  {
    id: 'mellanox-connectx-4-lx',
    card: {
      kind: 'nic',
      model: 'Mellanox ConnectX-4 Lx',
      slot: 'pcie',
      ports: { count: 2, kind: 'sfp28', speedMbps: 25000 },
    },
  },
  {
    id: 'intel-i350-t4',
    card: {
      kind: 'nic',
      model: 'Intel I350-T4',
      slot: 'pcie',
      ports: { count: 4, kind: 'rj45', speedMbps: 1000 },
    },
  },
  {
    id: 'intel-i226-v',
    card: {
      kind: 'nic',
      model: 'Intel I226-V 2.5GbE',
      slot: 'pcie',
      ports: { count: 1, kind: 'rj45', speedMbps: 2500 },
    },
  },
  {
    id: 'm2-rtl8125b',
    card: {
      kind: 'nic',
      model: 'M.2 2.5GbE adapter (RTL8125B)',
      slot: 'm2',
      ports: { count: 1, kind: 'rj45', speedMbps: 2500 },
    },
  },
  { id: 'lsi-9207-8i', card: { kind: 'hba', model: 'LSI 9207-8i (IT mode)', slot: 'pcie' } },
  { id: 'lsi-9300-8i', card: { kind: 'hba', model: 'LSI 9300-8i (IT mode)', slot: 'pcie' } },
  {
    id: 'asm1166-m2',
    card: { kind: 'hba', model: 'M.2 SATA adapter (ASM1166, 6 ports)', slot: 'm2' },
  },
];

/** Slots a device uses — the same count as the engine's VAL_SLOTS rule. */
export function slotUsage(hw: Hardware): Record<'pcie' | 'm2' | 'sata', number> {
  const cards = hw.cards ?? [];
  return {
    pcie:
      cards.filter((c) => c.slot === 'pcie').length +
      hw.gpus.filter((g) => g.attach === 'pcie').length,
    m2:
      cards.filter((c) => c.slot === 'm2').length +
      hw.gpus.filter((g) => g.attach === 'm2').length +
      hw.disks.filter((d) => d.type === 'ssd-nvme').length,
    sata: hw.disks.filter((d) => d.type === 'hdd' || d.type === 'ssd-sata').length,
  };
}
