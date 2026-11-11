import { z } from 'zod';
import {
  BytesSchema,
  CatalogRefSchema,
  GpuFeatureSchema,
  IdSchema,
  ResourcesSchema,
  WattsSchema,
} from './common';

/** Hardware and OS — docs/02-model-danych.md § 4.1, § 4.2. */

export const GpuSpecSchema = z.object({
  model: z.string(),
  vramBytes: BytesSchema.optional(),
  features: z.array(GpuFeatureSchema),
});

export const CpuSpecSchema = z.object({
  model: z.string(),
  cores: z.number().int().positive(),
  threads: z.number().int().positive(),
  baseGhz: z.number().positive().optional(),
  boostGhz: z.number().positive().optional(),
  tdpW: WattsSchema.optional(),
  arch: z.enum(['amd64', 'arm64']),
  /** Relative multi-core performance; i5-8500T = 100 (docs/06 § 3.1). */
  perf: z
    .object({
      score: z.number().nonnegative(),
      source: z.enum(['blender-opendata', 'estimated', 'user']),
      samples: z.number().int().nonnegative().optional(),
    })
    .optional(),
  igpu: GpuSpecSchema.optional(),
  catalogRef: CatalogRefSchema.optional(),
});

export const MemoryModuleSchema = z.object({
  sizeBytes: BytesSchema,
  count: z.number().int().positive(),
  speedMts: z.number().int().positive().optional(),
  soldered: z.boolean().optional(),
});

export const MemorySpecSchema = z.object({
  modules: z.array(MemoryModuleSchema),
  type: z.enum(['DDR3', 'DDR4', 'DDR5', 'LPDDR4', 'LPDDR5']).optional(),
  slotsTotal: z.number().int().nonnegative().optional(),
  maxBytes: BytesSchema.optional(),
  ecc: z.boolean().optional(),
});

export const DiskSchema = z.object({
  id: IdSchema,
  name: z.string(),
  type: z.enum(['hdd', 'ssd-sata', 'ssd-nvme', 'emmc', 'sd']),
  sizeBytes: BytesSchema,
  model: z.string().optional(),
});

export const StoragePoolSchema = z.object({
  id: IdSchema,
  name: z.string(),
  layout: z.enum([
    'single',
    'mirror',
    'raid0',
    'raid5',
    'raid6',
    'raid10',
    'raidz1',
    'raidz2',
    'raidz3',
  ]),
  diskIds: z.array(IdSchema),
  filesystem: z.enum(['zfs', 'lvm-thin', 'ext4', 'xfs', 'btrfs', 'ntfs', 'refs']).optional(),
  purpose: z.array(z.enum(['os', 'vm-disks', 'containers', 'data', 'backup'])).optional(),
  /** RAM reserved for ZFS ARC — counts towards memory capacity. */
  arcBytes: BytesSchema.optional(),
});

export const HardwareSchema = z.object({
  cpus: z.array(CpuSpecSchema),
  memory: MemorySpecSchema.optional(),
  disks: z.array(DiskSchema),
  pools: z.array(StoragePoolSchema),
  gpus: z.array(GpuSpecSchema),
  power: z.object({ idleW: WattsSchema, loadW: WattsSchema }).optional(),
});

export const UpsSpecSchema = z.object({
  capacityVa: z.number().positive(),
  capacityW: WattsSchema,
  batteryWh: z.number().positive().optional(),
});

export const PurchaseSchema = z.object({
  status: z.enum(['owned', 'to-buy', 'optional']),
  price: z.number().nonnegative().optional(),
  currency: z.string().optional(),
  url: z.url({ protocol: /^https$/ }).optional(),
});

export const OS_IDS = ['proxmox-ve', 'debian', 'ubuntu-server', 'windows-server'] as const;
export const OsIdSchema = z.enum(OS_IDS);

export const OsInstallSchema = z.object({
  osId: OsIdSchema,
  version: z.string(),
  overrideOverhead: ResourcesSchema.optional(),
  bootPoolId: IdSchema.optional(),
});

export type GpuSpec = z.infer<typeof GpuSpecSchema>;
export type CpuSpec = z.infer<typeof CpuSpecSchema>;
export type MemoryModule = z.infer<typeof MemoryModuleSchema>;
export type MemorySpec = z.infer<typeof MemorySpecSchema>;
export type Disk = z.infer<typeof DiskSchema>;
export type StoragePool = z.infer<typeof StoragePoolSchema>;
export type Hardware = z.infer<typeof HardwareSchema>;
export type UpsSpec = z.infer<typeof UpsSpecSchema>;
export type Purchase = z.infer<typeof PurchaseSchema>;
export type OsId = z.infer<typeof OsIdSchema>;
export type OsInstall = z.infer<typeof OsInstallSchema>;
