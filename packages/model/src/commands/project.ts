import type { Assertion, Note, Project, ProjectSettings, Snapshot, Tag } from '../schema/project';
import { applyChanges, CommandError, defineCommand, getOrThrow } from './core';

/** Project metadata, tags, layout and notes — docs/02 § 3, § 7. */

export const updateProject = defineCommand(
  'project.update',
  (
    draft,
    {
      changes,
    }: {
      changes: Partial<Pick<Project, 'name' | 'description'>> & {
        settings?: Partial<ProjectSettings>;
      };
    },
  ) => {
    const { settings, ...rest } = changes;
    if (rest.name !== undefined && rest.name.trim() === '') throw new CommandError('NAME_REQUIRED');
    applyChanges(draft, rest);
    if (settings) applyChanges(draft.settings, settings);
  },
);

export const addTag = defineCommand(
  'tag.add',
  (draft, { tag }: { tag: Omit<Tag, 'id'> }, ctx): string => {
    const id = ctx.createId('tag');
    draft.tags[id] = { ...tag, id };
    return id;
  },
);

export const updateTag = defineCommand(
  'tag.update',
  (draft, { id, changes }: { id: string; changes: Partial<Omit<Tag, 'id'>> }) => {
    applyChanges(getOrThrow(draft.tags, id, 'tag'), changes);
  },
);

export const deleteTag = defineCommand('tag.delete', (draft, { id }: { id: string }) => {
  getOrThrow(draft.tags, id, 'tag');
  const tagged: { tagIds: string[] }[] = [
    ...Object.values(draft.devices),
    ...Object.values(draft.workloads),
    ...Object.values(draft.apps),
    ...Object.values(draft.links),
  ];
  for (const item of tagged) item.tagIds = item.tagIds.filter((t) => t !== id);
  delete draft.tags[id];
});

/** Network assertions (SIM-06): expectations checked by the engines on every change. */
export const addAssertion = defineCommand(
  'assertion.add',
  (draft, { assertion }: { assertion: Omit<Assertion, 'id'> }, ctx): string => {
    const id = ctx.createId('assertion');
    draft.assertions[id] = { ...assertion, id };
    return id;
  },
);

export const updateAssertion = defineCommand(
  'assertion.update',
  (draft, { id, changes }: { id: string; changes: Partial<Omit<Assertion, 'id'>> }) => {
    applyChanges(getOrThrow(draft.assertions, id, 'assertion'), changes);
  },
);

export const deleteAssertion = defineCommand(
  'assertion.delete',
  (draft, { id }: { id: string }) => {
    getOrThrow(draft.assertions, id, 'assertion');
    delete draft.assertions[id];
  },
);

export const moveNode = defineCommand(
  'layout.moveNode',
  (draft, { id, x, y }: { id: string; x: number; y: number }) => {
    const device = getOrThrow(draft.devices, id, 'device');
    if (device.placement && draft.locations[device.placement.locationId]?.kind === 'rack') {
      throw new CommandError('RACK_POSITION_DERIVED', { id });
    }
    draft.layout.nodes[id] = { ...draft.layout.nodes[id], x, y };
  },
);

export const setLocationRect = defineCommand(
  'layout.setLocationRect',
  (draft, { id, rect }: { id: string; rect: { x: number; y: number; w: number; h: number } }) => {
    getOrThrow(draft.locations, id, 'location');
    draft.layout.locations[id] = { ...draft.layout.locations[id], rect: { ...rect } };
  },
);

export const setGroupByLocation = defineCommand(
  'layout.setGroupByLocation',
  (draft, { enabled }: { enabled: boolean }) => {
    draft.layout.groupByLocation = enabled;
  },
);

/** CAN-08: how a cable is drawn on the canvas (orthogonal by default). */
export const setLinkRouting = defineCommand(
  'layout.setLinkRouting',
  (draft, { id, routing }: { id: string; routing: 'straight' | 'orthogonal' }) => {
    getOrThrow(draft.links, id, 'link');
    if (routing === 'orthogonal') delete draft.layout.links[id];
    else draft.layout.links[id] = { ...draft.layout.links[id], routing };
  },
);

export const addNote = defineCommand(
  'note.add',
  (draft, { note }: { note: Omit<Note, 'id'> }, ctx): string => {
    const id = ctx.createId('note');
    draft.layout.notes[id] = { ...note, id };
    return id;
  },
);

export const updateNote = defineCommand(
  'note.update',
  (draft, { id, changes }: { id: string; changes: Partial<Omit<Note, 'id'>> }) => {
    applyChanges(getOrThrow(draft.layout.notes, id, 'note'), changes);
  },
);

export const deleteNote = defineCommand('note.delete', (draft, { id }: { id: string }) => {
  getOrThrow(draft.layout.notes, id, 'note');
  delete draft.layout.notes[id];
});

/** PRJ-07: brings back the content of a snapshot (one undo step); id and name stay. */
export const restoreSnapshot = defineCommand(
  'project.restoreSnapshot',
  (draft, { snapshot }: { snapshot: Pick<Snapshot, 'project'> }) => {
    const { name: _name, createdAt: _created, ...content } = snapshot.project;
    Object.assign(draft, content);
  },
);
