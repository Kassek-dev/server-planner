/**
 * Analysis engines — docs/03-architektura.md § 5. Pure functions, no React/DOM; run in a Web Worker.
 */
import { SCHEMA_VERSION } from '@server-planner/model';

export { analyze, sameDomain } from './analyze';
export { capacity, poolUsableBytes, usageStatus } from './capacity';
export { buildContext, carriedVlans, type EngineContext } from './context';
export { OS_OVERHEAD } from './defaults';
export type * from './types';
export { freeAddress, ISSUE_CODES, rules, type ValidationRule } from './validation/rules';

/** Project schema version this engine build understands. */
export const SUPPORTED_SCHEMA_VERSION = SCHEMA_VERSION;
