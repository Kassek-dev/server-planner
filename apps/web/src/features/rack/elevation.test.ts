import { describe, expect, it } from 'vitest';
import { homeLab } from '../canvas/testSupport';
import { rackElevation } from './elevation';

describe('rack elevation (LOC-09)', () => {
  const lab = homeLab();
  const rack = Object.values(lab.locations).find((l) => l.kind === 'rack');
  if (!rack) throw new Error('no rack');

  it('lists the rack from the top: devices, shelves and free runs', () => {
    const view = rackElevation(lab, rack.id, (id) => lab.devices[id]?.kind ?? '');
    expect(view?.units).toBe(12);
    expect(view?.freeUnits).toBe(7);
    expect(
      view?.items.map((i) =>
        i.kind === 'device'
          ? `${i.top}:${i.units}:${i.name}:${i.detail}`
          : i.kind === 'shelf'
            ? `${i.top}:shelf:${i.devices.join(',')}`
            : `${i.top}:${i.units}:free`,
      ),
    ).toEqual([
      '12:1:gw-01:router',
      '11:1:sw-core:switch',
      '10:shelf:pi-dns',
      '9:2:nas-01:nas',
      '7:7:free',
    ]);
  });

  it('every unit appears exactly once', () => {
    const view = rackElevation(lab, rack.id);
    expect(view?.items.reduce((n, i) => n + i.units, 0)).toBe(12);
  });

  it('is undefined for anything but a rack', () => {
    const room = Object.values(lab.locations).find((l) => l.kind !== 'rack');
    expect(rackElevation(lab, room?.id ?? '')).toBeUndefined();
  });
});
