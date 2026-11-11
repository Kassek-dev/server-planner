import { analyze } from '@server-planner/engine';
import type { Project } from '@server-planner/model';
import { expose } from 'comlink';

/** Engine worker (docs/03 § 5.5): analyses run off the UI thread. */
const api = {
  analyze(project: Project) {
    return analyze(project);
  },
};

export type EngineWorkerApi = typeof api;
expose(api);
