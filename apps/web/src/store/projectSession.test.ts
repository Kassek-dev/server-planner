import {
  addDevice,
  addVlan,
  CommandError,
  createProject,
  type Project,
  sequentialContext,
  updateProject,
} from '@server-planner/model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProjectSession } from './projectSession';

function setup(options: { historyLimit?: number } = {}) {
  const saved: Project[] = [];
  const repository = {
    save: vi.fn(async (p: Project) => {
      saved.push(p);
      return {} as never;
    }),
    recordChangeSaved: vi.fn(async () => {}),
  };
  let now = 0;
  const session = createProjectSession({
    repository,
    ctx: sequentialContext(),
    clock: () => now,
    ...options,
  });
  const project = createProject('Lab', sequentialContext());
  session.load(project);
  return { session, repository, saved, project, tick: (ms: number) => (now += ms) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('project session', () => {
  it('dispatches commands, records history and undoes / redoes', () => {
    const { session, project } = setup();
    const { deviceId } = session.dispatch(addDevice, { kind: 'switch' });
    expect(session.getState().project?.devices[deviceId]).toBeDefined();
    expect(session.getState().past.map((e) => e.label)).toEqual(['device.add']);

    expect(session.undo()).toBe(true);
    expect(session.getState().project?.devices).toEqual(project.devices);
    expect(session.redo()).toBe(true);
    expect(session.getState().project?.devices[deviceId]).toBeDefined();
    expect(session.redo()).toBe(false);
  });

  it('a new command clears the redo stack', () => {
    const { session } = setup();
    session.dispatch(addDevice, { kind: 'switch' });
    session.undo();
    session.dispatch(addDevice, { kind: 'router' });
    expect(session.getState().future).toHaveLength(0);
  });

  it('merges continuous edits with the same key into one undo step', () => {
    const { session, tick } = setup();
    session.dispatch(updateProject, { changes: { name: 'L' } }, { mergeKey: 'rename' });
    tick(200);
    session.dispatch(updateProject, { changes: { name: 'La' } }, { mergeKey: 'rename' });
    tick(200);
    session.dispatch(updateProject, { changes: { name: 'Lab 2' } }, { mergeKey: 'rename' });
    expect(session.getState().past).toHaveLength(1);
    session.undo();
    expect(session.getState().project?.name).toBe('Lab');
  });

  it('does not merge after the merge window or after undo', () => {
    const { session, tick } = setup();
    session.dispatch(updateProject, { changes: { name: 'A' } }, { mergeKey: 'rename' });
    tick(600);
    session.dispatch(updateProject, { changes: { name: 'B' } }, { mergeKey: 'rename' });
    expect(session.getState().past).toHaveLength(2);
    session.undo();
    session.dispatch(updateProject, { changes: { name: 'C' } }, { mergeKey: 'rename' });
    expect(session.getState().past).toHaveLength(2);
  });

  it('records command errors without changing the project', () => {
    const { session } = setup();
    session.dispatch(addVlan, { vlan: { vid: 10, name: 'Mgmt', color: 'violet' } });
    const before = session.getState().project;
    expect(() =>
      session.dispatch(addVlan, { vlan: { vid: 10, name: 'Dup', color: 'teal' } }),
    ).toThrow(CommandError);
    expect(session.getState().lastError?.code).toBe('VLAN_VID_TAKEN');
    expect(session.getState().project).toBe(before);
  });

  it('caps history length', () => {
    const { session } = setup({ historyLimit: 3 });
    for (let i = 0; i < 5; i += 1) session.dispatch(addDevice, { kind: 'switch' });
    expect(session.getState().past).toHaveLength(3);
  });

  it('autosaves once after a burst of changes (debounced)', async () => {
    const { session, repository, saved } = setup();
    session.dispatch(addDevice, { kind: 'switch' });
    session.dispatch(addDevice, { kind: 'router' });
    expect(session.getState().saveState).toBe('pending');
    await vi.advanceTimersByTimeAsync(999);
    expect(repository.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(Object.keys(saved[0]?.devices ?? {})).toHaveLength(2);
    expect(session.getState().saveState).toBe('saved');
  });

  it('flush writes pending changes immediately', async () => {
    const { session, repository } = setup();
    session.dispatch(addDevice, { kind: 'switch' });
    await session.flush();
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(session.getState().saveState).toBe('saved');
  });

  it('reports save failures', async () => {
    const { session, repository } = setup();
    repository.save.mockRejectedValueOnce(new Error('QuotaExceededError'));
    session.dispatch(addDevice, { kind: 'switch' });
    await session.flush();
    expect(session.getState().saveState).toBe('error');
  });
});

describe('transactions', () => {
  it('records several commands as one undo step', () => {
    const { session, project } = setup();
    session.transaction('canvas.add', (run) => {
      run(addDevice, { kind: 'switch' });
      run(addDevice, { kind: 'router' });
    });
    expect(session.getState().past.map((e) => e.label)).toEqual(['canvas.add']);
    expect(Object.keys(session.getState().project?.devices ?? {})).toHaveLength(2);
    session.undo();
    expect(session.getState().project?.devices).toEqual(project.devices);
  });

  it('changes nothing when a step is rejected', () => {
    const { session } = setup();
    session.dispatch(addVlan, { vlan: { vid: 10, name: 'Mgmt', color: 'violet' } });
    const before = session.getState().project;
    expect(() =>
      session.transaction('batch', (run) => {
        run(addDevice, { kind: 'switch' });
        run(addVlan, { vlan: { vid: 10, name: 'Dup', color: 'teal' } });
      }),
    ).toThrow(CommandError);
    expect(session.getState().project).toBe(before);
    expect(session.getState().past).toHaveLength(1);
  });
});
