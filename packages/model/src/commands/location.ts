import type { Location } from '../schema/location';
import type { Project } from '../schema/project';
import {
  applyChanges,
  CommandError,
  type DistributiveOmit,
  defineCommand,
  getOrThrow,
} from './core';

/** Locations: rooms, shelves, racks (D9, LOC-03…07) — docs/02 § 4.3. */

type Rect = { x: number; y: number; w: number; h: number };

const DEFAULT_RECT: Record<Location['kind'], Rect> = {
  room: { x: 0, y: 0, w: 20, h: 10 },
  shelf: { x: 0, y: 0, w: 20, h: 14 },
  rack: { x: 0, y: 0, w: 18, h: 22 },
};

/** Parent must be a room and a top-level one (max depth 2, LOC-07); a room cannot be nested. */
function checkParent(
  draft: Project,
  location: Pick<Location, 'kind' | 'parentId'>,
  selfId?: string,
) {
  if (location.parentId === undefined) return;
  const parent = getOrThrow(draft.locations, location.parentId, 'location');
  if (location.kind === 'room' || parent.kind !== 'room' || parent.parentId !== undefined) {
    throw new CommandError('LOCATION_INVALID_PARENT', { parentId: location.parentId });
  }
  if (parent.id === selfId)
    throw new CommandError('LOCATION_INVALID_PARENT', { parentId: parent.id });
}

export const addLocation = defineCommand(
  'location.add',
  (draft, payload: { location: DistributiveOmit<Location, 'id'>; rect?: Rect }, ctx): string => {
    checkParent(draft, payload.location);
    const id = ctx.createId('location');
    draft.locations[id] = { ...payload.location, id } as Location;
    draft.layout.locations[id] = {
      rect: { ...(payload.rect ?? DEFAULT_RECT[payload.location.kind]) },
    };
    return id;
  },
);

export type LocationChanges = Partial<DistributiveOmit<Location, 'id' | 'kind'>>;

export const updateLocation = defineCommand(
  'location.update',
  (draft, { id, changes }: { id: string; changes: LocationChanges }) => {
    const location = getOrThrow(draft.locations, id, 'location');
    if ('parentId' in changes) {
      checkParent(draft, { kind: location.kind, parentId: changes.parentId }, id);
      if (location.kind === 'room' && changes.parentId !== undefined) {
        throw new CommandError('LOCATION_INVALID_PARENT', { parentId: changes.parentId });
      }
    }
    applyChanges(location, changes as Partial<Location>);
  },
);

/** Deleting a location keeps its devices (they become unplaced) and un-nests child locations. */
export const deleteLocation = defineCommand('location.delete', (draft, { id }: { id: string }) => {
  getOrThrow(draft.locations, id, 'location');
  for (const device of Object.values(draft.devices)) {
    if (device.placement?.locationId === id) delete device.placement;
  }
  for (const child of Object.values(draft.locations)) {
    if (child.parentId === id) delete child.parentId;
  }
  delete draft.locations[id];
  delete draft.layout.locations[id];
});
