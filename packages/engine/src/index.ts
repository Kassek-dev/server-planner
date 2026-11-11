/**
 * Analysis engines (graph, L2/L3, validation, capacity, reach, flows) — docs/03-architektura.md § 5.
 * Implemented from MVP stage 5; pure functions, no React/DOM.
 */
import { SCHEMA_VERSION } from '@server-planner/model';

/** Project schema version this engine build understands. */
export const SUPPORTED_SCHEMA_VERSION = SCHEMA_VERSION;
