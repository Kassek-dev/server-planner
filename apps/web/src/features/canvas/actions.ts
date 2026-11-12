import {
  addDevice,
  addLocation,
  addNote,
  applyDeviceModel,
  type CatalogDevice,
  CommandError,
  checkRackFit,
  connectInterfaces,
  DEFAULT_FORM_FACTOR,
  type Device,
  deleteDevice,
  deleteLink,
  deleteLocation,
  deleteNote,
  duplicateDevice,
  findConnectablePorts,
  moveNode,
  nearestFreeU,
  type Placement,
  type Project,
  placeDevice,
  rackOf,
  setLocationRect,
  unplaceDevice,
  updateDevice,
  updateNote,
} from '@server-planner/model';
import type { ProjectSession } from '../../store/projectSession';
import { deviceSize, toGrid, unitAtY } from './geometry';
import { locationAt } from './graph';
import type { LibraryItem } from './library';

/**
 * Canvas interactions as functions over the editing session (docs/05 § 4).
 * Every user gesture is one undo step; rejected gestures return a message code instead.
 */

export type ActionResult =
  | { ok: true; selectId?: string }
  | { ok: false; code: string; params?: Record<string, string | number> };

const fail = (code: string, params?: Record<string, string | number>): ActionResult => ({
  ok: false,
  code,
  ...(params ? { params } : {}),
});

function guard(fn: () => ActionResult): ActionResult {
  try {
    return fn();
  } catch (error) {
    if (error instanceof CommandError) return fail(error.code, { ...error.params });
    throw error;
  }
}

export function nextName(base: string, names: Iterable<string>): string {
  const taken = new Set(names);
  let n = 1;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Where a device of `size` dropped with its top-left at `topLeft` should go. */
function resolveTarget(
  project: Project,
  device: Pick<Device, 'id' | 'formFactor'> & Partial<Device>,
  topLeft: { x: number; y: number },
  size: { w: number; h: number },
  probe: Project,
): { placement?: Placement; position?: { x: number; y: number } } | ActionResult {
  const center = { x: topLeft.x + size.w / 2, y: topLeft.y + size.h / 2 };
  const target = locationAt(project, center);
  if (!target) return { position: { x: toGrid(topLeft.x), y: toGrid(topLeft.y) } };

  if (target.kind === 'rack') {
    const rack = rackOf(project, target.id);
    if (!rack || !device.formFactor) return fail('DEVICE_NOT_PLACEABLE');
    const units = device.formFactor.mount === 'rack' ? device.formFactor.units : 1;
    const wanted = unitAtY(rack, topLeft.y - target.y, units);
    const fit = checkRackFit(probe, device.id, rack.id, wanted);
    if (fit.ok)
      return {
        placement: { locationId: rack.id, u: fit.u, ...(fit.onShelf ? { onShelf: true } : {}) },
      };
    if (fit.code === 'RACK_UNITS_OCCUPIED' || fit.code === 'RACK_UNIT_OUT_OF_RANGE') {
      const u = nearestFreeU(probe, device.id, rack.id, wanted);
      if (u !== undefined) return { placement: { locationId: rack.id, u } };
      return fail('RACK_FULL', { units, rack: rack.name });
    }
    return fail(fit.code, fit.params);
  }
  return {
    placement: { locationId: target.id },
    position: { x: toGrid(topLeft.x - target.x), y: toGrid(topLeft.y - target.y) },
  };
}

const isResult = (value: object): value is ActionResult => 'ok' in value;

export function addItemAt(
  session: ProjectSession,
  item: LibraryItem,
  point: { x: number; y: number },
  defaultName: (item: LibraryItem) => string,
  /** Catalog model (D-05 from the library): its form factor and hardware replace the defaults. */
  model?: { device: CatalogDevice; catalogVersion: string },
): ActionResult {
  const project = session.getState().project;
  if (!project) return fail('NO_PROJECT');
  return guard(() => {
    if (item.type === 'note') {
      // CAN-07: a sticky note centred on the drop point.
      const rect = { x: toGrid(point.x) - 6, y: toGrid(point.y) - 3, w: 12, h: 6 };
      const id = session.dispatch(addNote, { note: { text: '', rect } });
      return { ok: true, selectId: id };
    }
    if (item.type === 'location') {
      const size =
        item.kind === 'rack'
          ? { w: 16, h: 24 }
          : item.kind === 'shelf'
            ? { w: 18, h: 10 }
            : { w: 24, h: 14 };
      const base = defaultName(item);
      const name = nextName(
        base,
        Object.values(project.locations).map((l) => l.name),
      );
      const rect = { x: toGrid(point.x) - size.w / 2, y: toGrid(point.y) - 2, ...size };
      const location =
        item.kind === 'rack'
          ? ({ kind: 'rack', name, units: 12, width: '19in' } as const)
          : ({ kind: item.kind, name } as const);
      const id = session.dispatch(addLocation, { location, rect });
      return { ok: true, selectId: id };
    }

    // Size and units of the new device come from its defaults; probe placement on a dry run.
    const formFactor = model?.device.formFactor ?? DEFAULT_FORM_FACTOR[item.kind];
    const draftDevice = {
      id: 'dev_probe',
      kind: item.kind,
      ...(formFactor ? { formFactor } : {}),
    } as Device;
    const size = deviceSize(draftDevice);
    const topLeft = { x: point.x - size.w / 2, y: point.y - size.h / 2 };
    const probe: Project = {
      ...project,
      devices: {
        ...project.devices,
        dev_probe: {
          ...draftDevice,
          name: 'probe',
          tagIds: [],
          hardware: { cpus: [], disks: [], pools: [], gpus: [] },
        },
      },
    };
    const target = resolveTarget(project, draftDevice, topLeft, size, probe);
    if (isResult(target)) return target;

    const name = item.clientType
      ? nextName(
          item.clientType,
          Object.values(project.devices).map((d) => d.name),
        )
      : undefined;
    const id = session.transaction('canvas.addDevice', (run) => {
      const { deviceId } = run(addDevice, {
        kind: item.kind,
        ...(name ? { name } : {}),
        ...(target.placement ? { placement: target.placement } : {}),
        ...(target.position ? { position: target.position } : {}),
      });
      if (item.clientType)
        run(updateDevice, { id: deviceId, changes: { clientType: item.clientType } });
      if (model)
        run(applyDeviceModel, {
          id: deviceId,
          model: model.device,
          catalogVersion: model.catalogVersion,
        });
      return deviceId;
    });
    const hasInternet = Object.values(project.devices).some((d) => d.kind === 'internet');
    if ((item.kind === 'router' || item.kind === 'firewall') && !hasInternet)
      addInternetFor(session, id, {
        x: toGrid(topLeft.x),
        y: Math.max(0, toGrid(topLeft.y) - 6),
      });
    return { ok: true, selectId: id };
  });
}

/**
 * UI2 (docs/05 § 15): the first router gets an Internet node cabled to its WAN port — a separate
 * undo step, so the toast's Undo removes only the Internet node.
 */
export function addInternetFor(
  session: ProjectSession,
  routerId: string,
  position: { x: number; y: number },
): void {
  const project = session.getState().project;
  const wan = Object.values(project?.interfaces ?? {}).find(
    (i) => i.owner.type === 'device' && i.owner.id === routerId && i.kind === 'wan',
  );
  try {
    session.transaction('canvas.addInternet', (run) => {
      const { interfaceIds } = run(addDevice, { kind: 'internet', position });
      const port = interfaceIds[0];
      if (wan && port) run(connectInterfaces, { a: port, b: wan.id });
    });
  } catch (error) {
    // Optional convenience: a rejection (e.g. the WAN port is taken) must not undo the router.
    if (!(error instanceof CommandError)) throw error;
  }
}

export interface DraggedNode {
  id: string;
  type: 'device' | 'location' | 'note';
  /** Absolute top-left in flow coordinates. */
  x: number;
  y: number;
  /** Position relative to the parent node (what React Flow reports). */
  relative: { x: number; y: number };
  w: number;
  h: number;
}

/** Node drag end → move, (re)place into a location or rack slot, or take out of it. */
export function dropNodes(session: ProjectSession, dragged: DraggedNode[]): ActionResult {
  const project = session.getState().project;
  if (!project) return fail('NO_PROJECT');
  return guard(() => {
    session.transaction('canvas.move', (run) => {
      for (const node of dragged) {
        if (node.type === 'note') {
          const note = project.layout.notes[node.id];
          if (note)
            run(updateNote, {
              id: node.id,
              changes: { rect: { ...note.rect, x: toGrid(node.x), y: toGrid(node.y) } },
            });
          continue;
        }
        if (node.type === 'location') {
          const rect = project.layout.locations[node.id]?.rect;
          if (!rect) continue;
          run(setLocationRect, {
            id: node.id,
            rect: { ...rect, x: toGrid(node.relative.x), y: toGrid(node.relative.y) },
          });
          continue;
        }
        const device = project.devices[node.id];
        if (!device) continue;
        // Devices moved together with their location keep their relative placement.
        if (device.placement && dragged.some((d) => d.id === device.placement?.locationId))
          continue;
        const target = resolveTarget(
          project,
          device,
          { x: node.x, y: node.y },
          { w: node.w, h: node.h },
          project,
        );
        if (isResult(target)) {
          if (!target.ok) throw new CommandError(target.code, target.params ?? {});
          continue;
        }
        if (target.placement) {
          const same =
            device.placement?.locationId === target.placement.locationId &&
            device.placement.u === target.placement.u &&
            !!device.placement.onShelf === !!target.placement.onShelf;
          if (!same) run(placeDevice, { id: device.id, ...target.placement });
          if (target.position) run(moveNode, { id: device.id, ...target.position });
        } else if (target.position) {
          if (device.placement) run(unplaceDevice, { id: device.id, position: target.position });
          else run(moveNode, { id: device.id, ...target.position });
        }
      }
    });
    return { ok: true };
  });
}

export function connectDevices(
  session: ProjectSession,
  source: string,
  target: string,
): ActionResult {
  const project = session.getState().project;
  if (!project) return fail('NO_PROJECT');
  const pair = findConnectablePorts(project, source, target);
  if (!pair) {
    return fail('NO_FREE_PORTS', {
      a: project.devices[source]?.name ?? '',
      b: project.devices[target]?.name ?? '',
    });
  }
  return guard(() => {
    const id = session.dispatch(connectInterfaces, pair);
    return { ok: true, selectId: id };
  });
}

/** Deletes selected links, devices and locations as one undo step (U4: no confirmation). */
export function deleteSelection(
  session: ProjectSession,
  nodeIds: string[],
  edgeIds: string[],
): ActionResult {
  const project = session.getState().project;
  if (!project || nodeIds.length + edgeIds.length === 0) return { ok: true };
  return guard(() => {
    // Links first, then devices (their cascade removes remaining cables), then locations.
    session.transaction('canvas.delete', (run) => {
      for (const id of edgeIds) if (project.links[id]) run(deleteLink, { id });
      for (const id of nodeIds) if (project.devices[id]) run(deleteDevice, { id });
      for (const id of nodeIds) if (project.locations[id]) run(deleteLocation, { id });
      for (const id of nodeIds) if (project.layout.notes[id]) run(deleteNote, { id });
    });
    return { ok: true };
  });
}

export function duplicateSelection(session: ProjectSession, nodeIds: string[]): ActionResult {
  const project = session.getState().project;
  if (!project) return fail('NO_PROJECT');
  const devices = nodeIds.filter(
    (id) => project.devices[id] && project.devices[id]?.kind !== 'internet',
  );
  if (devices.length === 0) return { ok: true };
  return guard(() => {
    const ids = session.transaction('canvas.duplicate', (run) =>
      devices.map((id) => run(duplicateDevice, { id })),
    );
    return { ok: true, ...(ids[0] ? { selectId: ids[0] } : {}) };
  });
}
