/**
 * Analysis engines — docs/03-architektura.md § 5. Pure functions, no React/DOM; run in a Web Worker.
 */
import { type Project, SCHEMA_VERSION } from '@server-planner/model';
import { buildContext, type EngineOptions } from './context';
import { type ServiceVisibility, visibleFrom } from './simulation/access';
import { type AccessMatrix, accessMatrix } from './simulation/assertions';
import { type FlowRunResult, runFlow } from './simulation/flow';
import { type LoadItem, type ScenarioLoad, scenarioLoad } from './simulation/load';
import { exposureWithRoutes } from './simulation/proxy';
import {
  type Exposure,
  type Ipv6Exposure,
  ipv6Exposure,
  type ReachabilityResult,
  type ReachQuery,
  reach,
} from './simulation/reach';
import type { EntityRef } from './types';

export { analyze, sameDomain } from './analyze';
export {
  type CapacityMode,
  capacity,
  expectedAppResources,
  poolUsableBytes,
  usageStatus,
} from './capacity';
export {
  buildContext,
  carriedVlans,
  type EngineContext,
  type EngineOptions,
} from './context';
export {
  type DevicePower,
  type PoeBudget,
  type PowerReport,
  power,
  type UpsReport,
} from './power';
export {
  INTERNET_PROBES,
  type InternetAccess,
  internetAccess,
  type ServiceVisibility,
  visibleFrom,
} from './simulation/access';
export {
  type AccessMatrix,
  type AssertionResult,
  accessMatrix,
  evaluateAssertion,
  evaluateAssertions,
  MATRIX_PROBES,
  type MatrixCell,
} from './simulation/assertions';
export {
  type AppImpact,
  affectsOthers,
  type FailureImpact,
  type FailureScenario,
  failureImpact,
  type SinglePointOfFailure,
  singlePointsOfFailure,
} from './simulation/failure';
export { type FlowHop, type FlowRunResult, type FlowTarget, runFlow } from './simulation/flow';
export { exposureWithRoutes, proxyRoutes, resolveLocalName } from './simulation/proxy';
export {
  type Exposure,
  exposure,
  type ProxyRouteResult,
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

/** NET-17 (1.10): which hosts' IPv6 prefixes the internet can reach directly. */
export function simulateIpv6Exposure(
  project: Project,
  options: EngineOptions = {},
): Ipv6Exposure[] {
  return ipv6Exposure(buildContext(project, { ...options, family: 'ipv6' }));
}

/** Flow run on a project snapshot (FLW-03, worker entry point). */
export function simulateFlow(
  project: Project,
  input: Parameters<typeof runFlow>[1],
  options: EngineOptions = {},
): FlowRunResult {
  return runFlow(buildContext(project, options), input);
}

/** FLW-06/07 link load of processes running together, on a project snapshot. */
export function simulateLoad(
  project: Project,
  items: LoadItem[],
  options: EngineOptions = {},
): ScenarioLoad {
  return scenarioLoad(buildContext(project, options), items);
}

/** Access matrix on a project snapshot (SIM-04): zones, or the given elements. */
export function simulateMatrix(
  project: Project,
  refs?: EntityRef[],
  options: EngineOptions = {},
): AccessMatrix {
  return accessMatrix(buildContext(project, options), refs);
}

/** Port forwards and what they expose (SIM-05). */
export function simulateExposure(project: Project, options: EngineOptions = {}): Exposure[] {
  return exposureWithRoutes(buildContext(project, options));
}

/** Services visible from a client on a project snapshot (SIM-03). */
export function simulateVisibleFrom(
  project: Project,
  viewpoint: EntityRef,
  options: EngineOptions = {},
): ServiceVisibility[] {
  return visibleFrom(buildContext(project, options), viewpoint);
}
export {
  type PlacementMove,
  type PlacementPlan,
  type PlacementUpgrade,
  placementPlan,
} from './placement';
export * from './powerEstimate';
export { type LinkLoad, type LoadItem, type ScenarioLoad, scenarioLoad } from './simulation/load';
export { type MdnsDomain, mdnsDomains, mdnsVisible } from './simulation/mdns';
export type { Ipv6Exposure } from './simulation/reach';
