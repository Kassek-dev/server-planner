import {
  type AccessMatrix,
  type AnalysisResult,
  analyze,
  type EngineOptions,
  type EntityRef,
  type Exposure,
  type FailureImpact,
  type FailureScenario,
  type FlowRunResult,
  type FlowTarget,
  failureImpact,
  type LoadItem,
  type ReachabilityResult,
  type ReachQuery,
  type ScenarioLoad,
  type ServiceVisibility,
  type SinglePointOfFailure,
  sameDomain,
  simulateExposure,
  simulateFlow,
  simulateLoad,
  simulateMatrix,
  simulateReach,
  simulateVisibleFrom,
  singlePointsOfFailure,
} from '@server-planner/engine';
import type { CatalogFlow, Project } from '@server-planner/model';
import { type Remote, wrap } from 'comlink';
import { create } from 'zustand';
import type { EngineWorkerApi } from '../workers/engine.worker';
import type { ProjectSession } from './projectSession';

/** resultsStore (docs/03 § 4.2): engine output for the open project — always derived, never saved. */
export interface ResultsState {
  result: AnalysisResult | null;
  pending: boolean;
}

export const useResults = create<ResultsState>(() => ({ result: null, pending: false }));

type Analyzer = (project: Project, options?: EngineOptions) => Promise<AnalysisResult>;

/** On-demand simulation queries (SIM-01, SIM-03, SIM-04, SIM-05) on a project snapshot. */
export interface Simulator {
  reach(project: Project, query: ReachQuery): Promise<ReachabilityResult>;
  visibleFrom(project: Project, viewpoint: EntityRef): Promise<ServiceVisibility[]>;
  runFlow(
    project: Project,
    input: { flow: CatalogFlow; bindings: Record<string, FlowTarget | undefined> },
  ): Promise<FlowRunResult>;
  matrix(project: Project, refs?: EntityRef[]): Promise<AccessMatrix>;
  exposure(project: Project): Promise<Exposure[]>;
  /** SIM-07 "what if X fails?" and single points of failure. */
  failure(project: Project, scenario: FailureScenario): Promise<FailureImpact>;
  spof(project: Project): Promise<SinglePointOfFailure[]>;
  /** FLW-06/07 link load of processes running together. */
  load(project: Project, items: LoadItem[]): Promise<ScenarioLoad>;
}

let shared: Remote<EngineWorkerApi> | null | undefined;

/** One engine worker per page, created lazily; null when workers are unavailable (tests). */
function engineWorker(): Remote<EngineWorkerApi> | null {
  if (shared !== undefined) return shared;
  shared = null;
  if (typeof Worker === 'undefined') return shared;
  try {
    const worker = new Worker(new URL('../workers/engine.worker.ts', import.meta.url), {
      type: 'module',
    });
    shared = wrap<EngineWorkerApi>(worker);
  } catch {
    shared = null;
  }
  return shared;
}

/** Worker when available (browser), synchronous fallback otherwise (tests, old browsers). */
export function createAnalyzer(): Analyzer {
  const api = engineWorker();
  return api
    ? (project, options) => api.analyze(project, options)
    : async (project, options) => analyze(project, options);
}

export function createSimulator(): Simulator {
  const api = engineWorker();
  if (api)
    return {
      reach: (p, q) => api.reach(p, q),
      visibleFrom: (p, v) => api.visibleFrom(p, v),
      runFlow: (p, input) => api.runFlow(p, input),
      matrix: (p, refs) => api.matrix(p, refs),
      exposure: (p) => api.exposure(p),
      failure: (p, scenario) => api.failure(p, scenario),
      spof: (p) => api.spof(p),
      load: (p, items) => api.load(p, items),
    };
  return {
    reach: async (p, q) => simulateReach(p, q),
    visibleFrom: async (p, v) => simulateVisibleFrom(p, v),
    runFlow: async (p, input) => simulateFlow(p, input),
    matrix: async (p, refs) => simulateMatrix(p, refs),
    exposure: async (p) => simulateExposure(p),
    failure: async (p, scenario) => failureImpact(p, scenario),
    spof: async (p) => singlePointsOfFailure(p),
    load: async (p, items) => simulateLoad(p, items),
  };
}

/**
 * Re-analyses the session's project 150 ms after the last change; layout-only changes are skipped.
 * Results of stale runs are dropped. Returns an unsubscribe function.
 */
export function connectResults(
  session: ProjectSession,
  analyzer: Analyzer = createAnalyzer(),
  debounceMs = 150,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let analyzed: Project | null = null;
  let run = 0;

  const schedule = (project: Project | null) => {
    if (timer) clearTimeout(timer);
    if (!project) {
      analyzed = null;
      useResults.setState({ result: null, pending: false });
      return;
    }
    if (analyzed && analyzed.id === project.id && sameDomain(analyzed, project)) return;
    useResults.setState({ pending: true });
    timer = setTimeout(async () => {
      const id = ++run;
      const result = await analyzer(project);
      if (id !== run) return;
      analyzed = project;
      useResults.setState({ result, pending: false });
    }, debounceMs);
  };

  schedule(session.getState().project);
  const unsubscribe = session.subscribe((state, previous) => {
    if (state.project !== previous.project) schedule(state.project);
  });
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}
