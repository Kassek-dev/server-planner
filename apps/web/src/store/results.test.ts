import { addDevice, createProject, moveNode, sequentialContext } from '@server-planner/model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProjectSession } from './projectSession';
import { connectResults, useResults } from './results';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  useResults.setState({ result: null, pending: false });
});

function setup() {
  const session = createProjectSession({
    repository: { save: async () => ({}) as never, recordChangeSaved: async () => {} },
    ctx: sequentialContext(),
    autosaveMs: 60_000,
  });
  session.load(createProject('Lab', sequentialContext()));
  const analyzer = vi.fn(async () => ({
    issues: [],
    capacity: {},
    deviceStatus: {},
    durationMs: 0,
  }));
  const disconnect = connectResults(session, analyzer, 150);
  return { session, analyzer, disconnect };
}

describe('results store', () => {
  it('analyses after the debounce and skips layout-only changes', async () => {
    const { session, analyzer, disconnect } = setup();
    await vi.advanceTimersByTimeAsync(150);
    expect(analyzer).toHaveBeenCalledTimes(1);

    const { deviceId } = session.dispatch(addDevice, { kind: 'mini-pc' });
    session.dispatch(addDevice, { kind: 'switch' });
    await vi.advanceTimersByTimeAsync(150);
    expect(analyzer).toHaveBeenCalledTimes(2);

    session.dispatch(moveNode, { id: deviceId, x: 5, y: 5 });
    await vi.advanceTimersByTimeAsync(150);
    expect(analyzer).toHaveBeenCalledTimes(2);
    expect(useResults.getState().pending).toBe(false);
    disconnect();
  });
});
