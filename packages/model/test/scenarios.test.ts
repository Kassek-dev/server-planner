import { describe, expect, it } from 'vitest';
import {
  addFlowScenario,
  addFlowScenarioItem,
  deleteApp,
  execute,
  setFlowScenarioItemCount,
} from '../src';
import { buildHomeLab } from './support/home-lab';

describe('flow scenarios (FLW-07)', () => {
  it('collects processes, merges repeats and drops those of a removed app', () => {
    let p = buildHomeLab();
    const app = Object.values(p.apps)[0];
    if (!app) throw new Error('no app');
    const added = execute(p, addFlowScenario, { name: 'Evening' });
    p = added.project;
    const item = {
      appId: app.id,
      flowId: 'jellyfin.play-movie',
      count: 2,
      bindings: { client: { type: 'device' as const, id: 'dev_x' } },
    };
    p = execute(p, addFlowScenarioItem, { id: added.result, item }).project;
    p = execute(p, addFlowScenarioItem, { id: added.result, item }).project;
    expect(p.flowScenarios[added.result]?.items).toHaveLength(1);
    expect(p.flowScenarios[added.result]?.items[0]?.count).toBe(4);
    expect(() =>
      execute(p, setFlowScenarioItemCount, { id: added.result, index: 0, count: 0 }),
    ).toThrow(/SCENARIO_COUNT_INVALID/);
    p = execute(p, deleteApp, { id: app.id }).project;
    expect(p.flowScenarios[added.result]?.items).toEqual([]);
  });
});
