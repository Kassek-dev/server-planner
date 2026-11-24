import type { CatalogDevice } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { CARD_PRESETS } from '../inspector/device/parts';
import { freeSlots, ramKits } from './ModelConfigure';

const GiB = 1024 ** 3;
const m720q = {
  id: 'lenovo-m720q',
  kind: 'mini-pc',
  vendor: 'Lenovo',
  model: 'ThinkCentre M720q Tiny',
  hardware: {
    cpus: [],
    gpus: [],
    memory: {
      type: 'DDR4',
      slotsTotal: 2,
      maxBytes: 64 * GiB,
      modules: [{ sizeBytes: 8 * GiB, count: 1 }],
    },
    defaultDisks: [{ name: 'nvme0', type: 'ssd-nvme', sizeBytes: 256e9 }],
  },
  formFactor: { mount: 'standalone', shape: 'mini-pc' },
  ports: [],
  expansion: { pcieSlots: 1, m2Slots: 1, sataBays: 1 },
  source: ['curated'],
  confidence: 'curated',
} as CatalogDevice;

describe('Configure step (LIB-05)', () => {
  it('offers memory kits of the model type within its slots and maximum', () => {
    const kits = ramKits(m720q);
    expect(kits.length).toBeGreaterThan(0);
    expect(kits.every((k) => k.type === 'DDR4' && k.module.count <= 2)).toBe(true);
    expect(kits.every((k) => k.module.sizeBytes * k.module.count <= 64 * GiB)).toBe(true);
  });

  it('counts free slots after the shipped disk and what was added', () => {
    expect(freeSlots(m720q, { disks: [], cards: [] })).toMatchObject({ pcie: 1, m2: 0, sata: 1 });
    const nic = CARD_PRESETS.find((p) => p.card.slot === 'pcie')?.card;
    const after = freeSlots(m720q, {
      disks: [{ type: 'ssd-sata', sizeBytes: 1e12 }],
      cards: nic ? [nic] : [],
    });
    expect(after).toMatchObject({ pcie: 0, sata: 0 });
  });
});
