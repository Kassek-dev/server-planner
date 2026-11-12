import { createProject } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { addItemAt, deleteSelection } from '../canvas/actions';
import type { LibraryItem } from '../canvas/library';
import { deviceByName, homeLab, sessionWith } from '../canvas/testSupport';
import { describeCommit } from './describe';

const names = (item: LibraryItem) => ('kind' in item ? item.kind : item.type);

function recording(project = homeLab()) {
  const session = sessionWith(project);
  const toasts: ReturnType<typeof describeCommit>[] = [];
  session.onCommit((entry, before) => {
    const after = session.getState().project;
    if (after) toasts.push(describeCommit(entry, before, after));
  });
  return { session, toasts };
}

describe('toasts for commits (O-12, UI2/UI3)', () => {
  it('names deleted devices and offers Undo of that step', () => {
    const lab = homeLab();
    const { session, toasts } = recording(lab);
    deleteSelection(session, [deviceByName(lab, 'nas-01').id], []);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.message).toEqual({ key: 'deleted', params: { names: 'nas-01' } });
    expect(toasts[0]?.undo).toBe(session.getState().past.at(-1));
  });

  it('summarises bulk deletions', () => {
    const lab = homeLab();
    const { session, toasts } = recording(lab);
    deleteSelection(
      session,
      ['nas-01', 'pi-dns', 'tv-salon'].map((n) => deviceByName(lab, n).id),
      [],
    );
    expect(toasts[0]?.message.key).toBe('deletedMany');
    expect(toasts[0]?.message.params?.count).toBe(2);
  });

  it('stays silent for ordinary edits', () => {
    const { session, toasts } = recording();
    addItemAt(session, { type: 'device', kind: 'mini-pc', meta: '' }, { x: 1600, y: 1600 }, names);
    expect(toasts).toEqual([null]);
  });

  it('the first router brings an Internet node on its WAN port, undoable on its own', () => {
    const { session, toasts } = recording(createProject('Empty'));
    const result = addItemAt(
      session,
      { type: 'device', kind: 'router', meta: '' },
      { x: 800, y: 800 },
      names,
    );
    const project = session.getState().project;
    const internet = Object.values(project?.devices ?? {}).find((d) => d.kind === 'internet');
    expect(internet).toBeDefined();
    expect(Object.values(project?.links ?? {})).toHaveLength(1);
    expect(toasts.at(-1)?.message.key).toBe('internetAdded');
    expect(session.getState().past.map((e) => e.label)).toEqual([
      'canvas.addDevice',
      'canvas.addInternet',
    ]);
    session.undo();
    const after = session.getState().project;
    expect(Object.values(after?.devices ?? {}).some((d) => d.kind === 'internet')).toBe(false);
    expect(result.ok && after?.devices[result.selectId ?? '']).toBeTruthy();

    // A second router does not add another Internet node.
    session.redo();
    addItemAt(session, { type: 'device', kind: 'router', meta: '' }, { x: 1600, y: 800 }, names);
    const devices = Object.values(session.getState().project?.devices ?? {});
    expect(devices.filter((d) => d.kind === 'internet')).toHaveLength(1);
  });
});
