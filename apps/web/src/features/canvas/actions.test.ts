import { describe, expect, it } from 'vitest';
import {
  addItemAt,
  connectDevices,
  deleteSelection,
  dropNodes,
  duplicateSelection,
} from './actions';
import { rackRowTop } from './geometry';
import { absoluteLocationRects } from './graph';
import { deviceByName, homeLab, sessionWith } from './testSupport';

const names = (item: { kind: string }) => item.kind;

function setup() {
  const lab = homeLab();
  const session = sessionWith(lab);
  const rects = absoluteLocationRects(lab);
  const rackRect = rects.find((r) => r.kind === 'rack');
  const rack = Object.values(lab.locations).find((l) => l.kind === 'rack');
  if (!rackRect || !rack || rack.kind !== 'rack') throw new Error('fixture');
  return { lab, session, rackRect, rack };
}

describe('addItemAt', () => {
  it('adds a device on empty canvas at a grid position', () => {
    const { session } = setup();
    const result = addItemAt(
      session,
      { type: 'device', kind: 'mini-pc', meta: '' },
      { x: 1600, y: 1600 },
      names,
    );
    expect(result.ok).toBe(true);
    const project = session.getState().project;
    const id = result.ok ? result.selectId : undefined;
    expect(id && project?.layout.nodes[id]).toEqual({ x: 93, y: 98 });
    expect(session.getState().past).toHaveLength(1);
  });

  it('snaps a rack-mount device to the free unit under the cursor', () => {
    const { session, rackRect, rack } = setup();
    // 10-inch rack: a 19-inch router does not fit…
    const wide = addItemAt(
      session,
      { type: 'device', kind: 'router', meta: '' },
      { x: rackRect.x + 120, y: rackRect.y + rackRowTop(rack, 5) + 12 },
      names,
    );
    expect(wide).toMatchObject({ ok: false, code: 'RACK_WIDTH' });
  });

  it('adds locations and names them uniquely', () => {
    const { session } = setup();
    addItemAt(
      session,
      { type: 'location', kind: 'room', meta: '' },
      { x: 2000, y: 0 },
      () => 'Room',
    );
    addItemAt(
      session,
      { type: 'location', kind: 'room', meta: '' },
      { x: 2400, y: 0 },
      () => 'Room',
    );
    const rooms = Object.values(session.getState().project?.locations ?? {}).filter((l) =>
      l.name.startsWith('Room-'),
    );
    expect(rooms.map((r) => r.name).sort()).toEqual(['Room-1', 'Room-2']);
  });
});

describe('dropNodes', () => {
  it('takes a device out of its location when dropped on empty canvas', () => {
    const { session, lab } = setup();
    const pve = deviceByName(lab, 'pve1');
    const result = dropNodes(session, [
      { id: pve.id, type: 'device', x: 3200, y: 3200, relative: { x: 0, y: 0 }, w: 216, h: 72 },
    ]);
    expect(result.ok).toBe(true);
    const moved = session.getState().project?.devices[pve.id];
    expect(moved?.placement).toBeUndefined();
    expect(session.getState().project?.layout.nodes[pve.id]).toEqual({ x: 200, y: 200 });
  });

  it('moves a rack device to the nearest free unit', () => {
    const { session, lab, rackRect, rack } = setup();
    const sw = deviceByName(lab, 'sw-core');
    const y = rackRect.y + rackRowTop(rack, 4) + 1;
    const result = dropNodes(session, [
      {
        id: sw.id,
        type: 'device',
        x: rackRect.x + 28,
        y,
        relative: { x: 28, y: 0 },
        w: 160,
        h: 24,
      },
    ]);
    expect(result.ok).toBe(true);
    expect(session.getState().project?.devices[sw.id]?.placement).toEqual({
      locationId: rack.id,
      u: 4,
    });
  });

  it('rejects standalone devices where the rack has no shelf, leaving the project unchanged', () => {
    const { session, lab, rackRect, rack } = setup();
    const pve = deviceByName(lab, 'pve1');
    const before = session.getState().project;
    const y = rackRect.y + rackRowTop(rack, 3) - 20;
    const result = dropNodes(session, [
      {
        id: pve.id,
        type: 'device',
        x: rackRect.x + 30,
        y,
        relative: { x: 0, y: 0 },
        w: 216,
        h: 72,
      },
    ]);
    expect(result).toMatchObject({ ok: false, code: 'RACK_NO_SHELF' });
    expect(session.getState().project).toBe(before);
  });
});

describe('connect, delete, duplicate', () => {
  it('connects two tiles through auto-picked ports', () => {
    const { session, lab } = setup();
    const result = connectDevices(
      session,
      deviceByName(lab, 'sw-core').id,
      deviceByName(lab, 'nas-01').id,
    );
    expect(result.ok).toBe(true);
    expect(Object.keys(session.getState().project?.links ?? {})).toHaveLength(
      Object.keys(lab.links).length + 1,
    );
  });

  it('reports when no compatible port is free', () => {
    const { session, lab } = setup();
    const result = connectDevices(
      session,
      deviceByName(lab, 'Internet').id,
      deviceByName(lab, 'nas-01').id,
    );
    expect(result).toMatchObject({ ok: false, code: 'NO_FREE_PORTS' });
  });

  it('deletes a device and a link in one undo step', () => {
    const { session, lab } = setup();
    const nas = deviceByName(lab, 'nas-01');
    const link = Object.values(lab.links).find((l) => l.medium === 'wifi');
    deleteSelection(session, [nas.id], link ? [link.id] : []);
    expect(session.getState().project?.devices[nas.id]).toBeUndefined();
    expect(session.getState().past).toHaveLength(1);
    session.undo();
    expect(session.getState().project).toEqual(lab);
  });

  it('duplicates selected devices but never the Internet node', () => {
    const { session, lab } = setup();
    duplicateSelection(session, [deviceByName(lab, 'pve1').id, deviceByName(lab, 'Internet').id]);
    const names = Object.values(session.getState().project?.devices ?? {}).map((d) => d.name);
    expect(names).toContain('pve2');
    expect(names.filter((n) => n === 'Internet')).toHaveLength(1);
  });
});
