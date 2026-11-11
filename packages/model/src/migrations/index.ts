import type { z } from 'zod';
import { clone } from '../clone';
import {
  PROJECT_FILE_FORMAT,
  type Project,
  type ProjectFile,
  ProjectFileSchema,
} from '../schema/project';

/** Project file versioning and migrations — docs/02-model-danych.md § 11 (Z8). */

export const CURRENT_SCHEMA_VERSION = 1;

/** `migrations[n]` upgrades a raw v<n> file to v<n+1>. Pure, idempotent, never loses data. */
const migrations: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {};

export type ProjectFileErrorCode =
  | 'NOT_A_PROJECT_FILE'
  | 'SCHEMA_TOO_NEW'
  | 'SCHEMA_UNSUPPORTED'
  | 'INVALID_PROJECT';

export class ProjectFileError extends Error {
  readonly code: ProjectFileErrorCode;
  readonly params: Readonly<Record<string, string | number>>;
  readonly issues: readonly z.core.$ZodIssue[];

  constructor(
    code: ProjectFileErrorCode,
    params: Record<string, string | number> = {},
    issues: readonly z.core.$ZodIssue[] = [],
  ) {
    super(`${code} ${JSON.stringify(params)}`);
    this.name = 'ProjectFileError';
    this.code = code;
    this.params = params;
    this.issues = issues;
  }
}

export interface ParsedProjectFile {
  file: ProjectFile;
  /** Set when the file was upgraded from an older schema version. */
  migratedFrom?: number;
}

/** Parses an imported JSON value: format check → migration chain → Zod validation. */
export function parseProjectFile(raw: unknown): ParsedProjectFile {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    (raw as { format?: unknown }).format !== PROJECT_FILE_FORMAT
  ) {
    throw new ProjectFileError('NOT_A_PROJECT_FILE');
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ProjectFileError('NOT_A_PROJECT_FILE');
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new ProjectFileError('SCHEMA_TOO_NEW', { version, supported: CURRENT_SCHEMA_VERSION });
  }

  let data = clone(raw) as Record<string, unknown>;
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v += 1) {
    const migrate = migrations[v];
    if (!migrate) throw new ProjectFileError('SCHEMA_UNSUPPORTED', { version: v });
    data = { ...migrate(data), schemaVersion: v + 1 };
  }

  const result = ProjectFileSchema.safeParse(data);
  if (!result.success) {
    throw new ProjectFileError(
      'INVALID_PROJECT',
      { count: result.error.issues.length },
      result.error.issues,
    );
  }
  const cycle = findHostingCycle(result.data.project);
  if (cycle) throw new ProjectFileError('INVALID_PROJECT', { count: 1, cycleAt: cycle });
  const nesting = findInvalidLocationNesting(result.data.project);
  if (nesting) throw new ProjectFileError('INVALID_PROJECT', { count: 1, locationAt: nesting });

  return version < CURRENT_SCHEMA_VERSION
    ? { file: result.data, migratedFrom: version }
    : { file: result.data };
}

/** Returns a workload ID that is part of a hosting cycle, or `undefined`. Linear in workload count. */
export function findHostingCycle(project: Project): string | undefined {
  const state = new Map<string, 'visiting' | 'done'>();
  for (const start of Object.keys(project.workloads)) {
    const path: string[] = [];
    let id: string | undefined = start;
    while (id !== undefined && state.get(id) !== 'done') {
      if (state.get(id) === 'visiting') return id;
      state.set(id, 'visiting');
      path.push(id);
      const host: Project['workloads'][string]['host'] | undefined = project.workloads[id]?.host;
      id = host?.type === 'workload' ? host.id : undefined;
    }
    for (const visited of path) state.set(visited, 'done');
  }
  return undefined;
}

/**
 * Location nesting must be room → rack/shelf (max depth 2, LOC-07). Returns the first offending
 * location ID — this also rules out parent cycles in untrusted files.
 */
export function findInvalidLocationNesting(project: Project): string | undefined {
  for (const location of Object.values(project.locations)) {
    if (location.parentId === undefined) continue;
    const parent = project.locations[location.parentId];
    if (
      !parent ||
      location.kind === 'room' ||
      parent.kind !== 'room' ||
      parent.parentId !== undefined
    ) {
      return location.id;
    }
  }
  return undefined;
}
