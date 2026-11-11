import { type AnalysisResult, analyze, sameDomain } from '@server-planner/engine';
import type { Project } from '@server-planner/model';
import { wrap } from 'comlink';
import { create } from 'zustand';
import type { EngineWorkerApi } from '../workers/engine.worker';
import type { ProjectSession } from './projectSession';

/** resultsStore (docs/03 § 4.2): engine output for the open project — always derived, never saved. */
export interface ResultsState {
  result: AnalysisResult | null;
  pending: boolean;
}

export const useResults = create<ResultsState>(() => ({ result: null, pending: false }));

type Analyzer = (project: Project) => Promise<AnalysisResult>;

/** Worker when available (browser), synchronous fallback otherwise (tests, old browsers). */
export function createAnalyzer(): Analyzer {
  if (typeof Worker === 'undefined') return async (project) => analyze(project);
  try {
    const worker = new Worker(new URL('../workers/engine.worker.ts', import.meta.url), {
      type: 'module',
    });
    const api = wrap<EngineWorkerApi>(worker);
    return (project) => api.analyze(project);
  } catch {
    return async (project) => analyze(project);
  }
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
