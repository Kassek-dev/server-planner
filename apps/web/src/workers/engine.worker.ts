import { analyze, simulateReach, simulateVisibleFrom } from '@server-planner/engine';
import { expose } from 'comlink';

/** Engine worker (docs/03 § 5.5): analyses and on-demand simulation queries run off the UI thread. */
const api = {
  analyze,
  reach: simulateReach,
  visibleFrom: simulateVisibleFrom,
};

export type EngineWorkerApi = typeof api;
expose(api);
