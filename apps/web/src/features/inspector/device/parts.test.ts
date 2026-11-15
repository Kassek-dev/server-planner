import {
  CpuSpecSchema,
  DiskSchema,
  GpuSpecSchema,
  MemoryModuleSchema,
} from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { cpuFromCatalog, DISK_PRESETS, gpuFromCatalog, RAM_PRESETS } from './parts';

describe('predefined parts (HW-09)', () => {
  it('RAM and disk presets are valid model values with unique ids', () => {
    for (const r of RAM_PRESETS) expect(MemoryModuleSchema.safeParse(r.module).success).toBe(true);
    for (const d of DISK_PRESETS)
      expect(DiskSchema.safeParse({ ...d, id: 'dsk_x', name: 'd' }).success).toBe(true);
    const ids = [...RAM_PRESETS, ...DISK_PRESETS].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('copies catalog CPUs and GPUs into device specs', () => {
    const cpu = cpuFromCatalog(
      {
        id: 'intel-n100',
        vendor: 'intel',
        model: 'Intel N100',
        cores: 4,
        threads: 4,
        arch: 'amd64',
        source: ['curated'],
        confidence: 'curated',
      },
      '2026.46',
    );
    expect(CpuSpecSchema.parse(cpu)).toEqual({
      model: 'Intel N100',
      cores: 4,
      threads: 4,
      arch: 'amd64',
      catalogRef: { id: 'intel-n100', version: '2026.46' },
    });
    const gpu = gpuFromCatalog({
      id: 'tesla-p4',
      vendor: 'nvidia',
      kind: 'gpu',
      attach: 'pcie',
      model: 'NVIDIA Tesla P4',
      vramBytes: 8 * 1024 ** 3,
      features: ['nvenc', 'cuda'],
      source: ['curated'],
      confidence: 'curated',
    });
    expect(GpuSpecSchema.parse(gpu)).toEqual({
      model: 'NVIDIA Tesla P4',
      vramBytes: 8 * 1024 ** 3,
      features: ['nvenc', 'cuda'],
    });
  });
});
