import { describe, expect, it } from 'vitest';
import {
  addCard,
  applyDeviceModel,
  type CatalogDevice,
  connectInterfaces,
  execute,
  type Project,
  removeCard,
  setExpansion,
} from '../src';
import { buildHomeLab } from './support/home-lab';

/** LIB-05 add-in cards and expansion slots (schema v3). */

const byName = (p: Project, name: string) => {
  const d = Object.values(p.devices).find((x) => x.name === name);
  if (!d) throw new Error(`no ${name}`);
  return d;
};
const portsOf = (p: Project, deviceId: string) =>
  Object.values(p.interfaces).filter((i) => i.owner.type === 'device' && i.owner.id === deviceId);

describe('add-in cards (LIB-05)', () => {
  it('a NIC adds its ports; removing it removes them and their cables', () => {
    let p = buildHomeLab();
    const pve = byName(p, 'pve1');
    const before = portsOf(p, pve.id).length;
    const added = execute(p, addCard, {
      deviceId: pve.id,
      card: {
        kind: 'nic',
        model: 'Intel X520-DA2',
        slot: 'pcie',
        ports: { count: 2, kind: 'sfp+', speedMbps: 10000 },
      },
    });
    p = added.project;
    const card = p.devices[pve.id]?.hardware.cards?.[0];
    expect(card).toMatchObject({ id: added.result, model: 'Intel X520-DA2', slot: 'pcie' });
    expect(card?.interfaceIds).toHaveLength(2);
    expect(card?.interfaceIds.map((id) => p.interfaces[id]?.name)).toEqual(['card1p0', 'card1p1']);
    expect(portsOf(p, pve.id)).toHaveLength(before + 2);

    // A cable on a card port goes with the card.
    const nas = byName(p, 'nas-01');
    const free = portsOf(p, nas.id).find(
      (i) => !Object.values(p.links).some((l) => l.a === i.id || l.b === i.id),
    );
    if (free && card?.interfaceIds[0]) {
      p = execute(p, connectInterfaces, { a: card.interfaceIds[0], b: free.id }).project;
    }
    const links = Object.keys(p.links).length;
    p = execute(p, removeCard, { deviceId: pve.id, cardId: added.result }).project;
    expect(p.devices[pve.id]?.hardware.cards).toBeUndefined();
    expect(portsOf(p, pve.id)).toHaveLength(before);
    if (free) expect(Object.keys(p.links)).toHaveLength(links - 1);
  });

  it('rejects a card without a model or with too many ports', () => {
    const p = buildHomeLab();
    const pve = byName(p, 'pve1');
    expect(() =>
      execute(p, addCard, { deviceId: pve.id, card: { kind: 'hba', model: ' ', slot: 'pcie' } }),
    ).toThrow(/CARD_MODEL_REQUIRED/);
    expect(() =>
      execute(p, addCard, {
        deviceId: pve.id,
        card: { kind: 'nic', model: 'x', slot: 'pcie', ports: { count: 9, kind: 'rj45' } },
      }),
    ).toThrow(/CARD_PORTS_INVALID/);
  });

  it('expansion slots come from the catalog model and can be edited; card ports survive a model', () => {
    let p = buildHomeLab();
    const pve = byName(p, 'pve1');
    p = execute(p, setExpansion, { id: pve.id, expansion: { pcieSlots: 1, m2Slots: 2 } }).project;
    expect(p.devices[pve.id]?.hardware.expansion).toEqual({ pcieSlots: 1, m2Slots: 2 });
    p = execute(p, addCard, {
      deviceId: pve.id,
      card: {
        kind: 'nic',
        model: 'Intel I350-T4',
        slot: 'pcie',
        ports: { count: 4, kind: 'rj45' },
      },
    }).project;
    const model: CatalogDevice = {
      id: 'test-mini',
      kind: pve.kind,
      vendor: 'Test',
      model: 'Mini',
      hardware: { cpus: [], gpus: [] },
      formFactor: pve.formFactor ?? { mount: 'standalone', shape: 'mini-pc' },
      ports: [{ name: 'eth0', kind: 'rj45', speedMbps: 1000 }],
      expansion: { pcieSlots: 1, m2Slots: 1, sataBays: 1 },
      source: ['curated'],
      confidence: 'curated',
    };
    p = execute(p, applyDeviceModel, { id: pve.id, model, catalogVersion: '2026.47' }).project;
    expect(p.devices[pve.id]?.hardware.expansion).toEqual({
      pcieSlots: 1,
      m2Slots: 1,
      sataBays: 1,
    });
    const card = p.devices[pve.id]?.hardware.cards?.[0];
    expect(card?.interfaceIds.every((id) => p.interfaces[id])).toBe(true);
    p = execute(p, setExpansion, { id: pve.id, expansion: undefined }).project;
    expect(p.devices[pve.id]?.hardware.expansion).toBeUndefined();
  });
});
