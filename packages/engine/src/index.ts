/**
 * Analysis engines — docs/03-architektura.md § 5. Pure functions, no React/DOM; run in a Web Worker.
 */
import { type Project, SCHEMA_VERSION } from '@server-planner/model';
import { buildContext, type EngineOptions } from './context';
import { type ServiceVisibility, visibleFrom } from './simulation/access';
import { type ReachabilityResult, type ReachQuery, reach } from './simulation/reach';
import type { EntityRef } from './types';

export { analyze, sameDomain } from './analyze';
export { capacity, poolUsableBytes, usageStatus } from './capacity';
export {
  buildContext,
  carriedVlans,
  type EngineContext,
  type EngineOptions,
} from './context';
export {
  INTERNET_PROBES,
  type InternetAccess,
  internetAccess,
  type ServiceVisibility,
  visibleFrom,
} from './simulation/access';
export {
  type ReachabilityResult,
  type ReachQuery,
  reach,
  SIM_CODES,
  type SimLayer,
  type SimStep,
} from './simulation/reach';
export type * from './types';
export { freeAddress, ISSUE_CODES, rules, type ValidationRule } from './validation/rules';

/** Project schema version this engine build understands. */
export const SUPPORTED_SCHEMA_VERSION = SCHEMA_VERSION;

/** Reachability on a project snapshot (worker entry point for on-demand queries). */
export function simulateReach(
  project: Project,
  query: ReachQuery,
  options: EngineOptions = {},
): ReachabilityResult {
  return reach(buildContext(project, options), query);
}

/** Services visible from a client on a project snapshot (SIM-03). */
export function simulateVisibleFrom(
  project: Project,
  viewpoint: EntityRef,
  options: EngineOptions = {},
): ServiceVisibility[] {
  return visibleFrom(buildContext(project, options), viewpoint);
}
