import { addCard, execute, type Project, setExpansion, updateDevice } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { analyze, byName, homeLab } from './support';

/** LIB-05 parts fit the board: memory, slots and bays (VAL_RAM_MAX, VAL_RAM_SLOTS, VAL_SLOTS). */

const GiB = 1024 ** 3;
const codes = (p: Project) => analyze(p).issues.map((i) => i.code);

describe('hardware fit (LIB-05)', () => {
  it('flags memory above the maximum and more modules than slots', () => {
    let p = homeLab();
    const pve = byName(p, 'pve1');
    p = execute(p, updateDevice, {
      id: pve.id,
      changes: {
        hardware: {
          ...pve.hardware,
          memory: {
            type: 'DDR4',
            slotsTotal: 2,
            maxBytes: 64 * GiB,
            modules: [{ sizeBytes: 32 * GiB, count: 3 }],
          },
        },
      },
    }).project;
    const issues = analyze(p).issues;
    expect(issues.find((i) => i.code === 'VAL_RAM_MAX')?.params).toMatchObject({
      total: 96,
      max: 64,
    });
    expect(issues.find((i) => i.code === 'VAL_RAM_SLOTS')?.params).toMatchObject({
      modules: 3,
      slots: 2,
    });
  });

  it('counts cards, NVMe disks and SATA drives against the slots the device has', () => {
    let p = homeLab();
    const pve = byName(p, 'pve1');
    expect(codes(p)).not.toContain('VAL_SLOTS');
    p = execute(p, setExpansion, { id: pve.id, expansion: { pcieSlots: 1, m2Slots: 0 } }).project;
    for (const model of ['Intel X520-DA2', 'LSI 9207-8i'])
      p = execute(p, addCard, {
        deviceId: pve.id,
        card: { kind: model.startsWith('LSI') ? 'hba' : 'nic', model, slot: 'pcie' },
      }).project;
    const slots = analyze(p)
      .issues.filter((i) => i.code === 'VAL_SLOTS')
      .map((i) => i.params.slot);
    expect(slots).toContain('pcie');
    const nvme = byName(p, 'pve1').hardware.disks.some((d) => d.type === 'ssd-nvme');
    expect(slots.includes('m2')).toBe(nvme);
    expect(slots).not.toContain('sata');
  });
});
