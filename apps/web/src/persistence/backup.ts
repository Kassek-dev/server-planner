import {
  defaultContext,
  type ModelContext,
  PROJECT_FILE_FORMAT,
  type Project,
  type ProjectFile,
  ProjectFileError,
  parseProjectFile,
  SCHEMA_VERSION,
  type Snapshot,
} from '@server-planner/model';
import { version } from '../../package.json';
import type { BackupState } from './db';

/** Export / import of project files — PRJ-04, EXP-02, D-02; docs/03 § 6, § 10. */

/** App version from apps/web/package.json (the release skill bumps it there). */
export const APP_VERSION: string = version;
/** Import size limit (docs/03 § 10). */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export function toProjectFile(
  project: Project,
  now: string = defaultContext.now(),
  snapshots: Snapshot[] = [],
): ProjectFile {
  return {
    format: PROJECT_FILE_FORMAT,
    schemaVersion: SCHEMA_VERSION as 1,
    appVersion: APP_VERSION,
    exportedAt: now,
    project,
    ...(snapshots.length > 0 ? { snapshots } : {}),
  };
}

/** `home-lab-2026-11-11.json` */
export function exportFileName(project: Project, now: string = defaultContext.now()): string {
  const slug =
    project.name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .slice(0, 60) || 'project';
  return `${slug}-${now.slice(0, 10)}.json`;
}

export function exportBlob(project: Project, now?: string, snapshots: Snapshot[] = []): Blob {
  return new Blob([`${JSON.stringify(toProjectFile(project, now, snapshots), null, 2)}\n`], {
    type: 'application/json',
  });
}

export type ImportErrorCode = 'FILE_TOO_LARGE' | 'INVALID_JSON' | ProjectFileError['code'];

export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    readonly params: Readonly<Record<string, string | number>> = {},
  ) {
    super(code);
    this.name = 'ImportError';
  }
}

export interface ImportResult {
  project: Project;
  migratedFrom?: number;
  /** A project with the same ID existed — imported as a copy with a new ID. */
  asCopy: boolean;
  snapshotCount: number;
  /** PRJ-07 snapshots included in the file (D-04 "include snapshots"). */
  snapshots: Snapshot[];
}

/** Validates and prepares an imported file. Never trusts the input (Zod, size limit, no eval). */
export function prepareImport(
  text: string,
  idExists: (id: string) => boolean,
  ctx: ModelContext = defaultContext,
): ImportResult {
  if (text.length > MAX_IMPORT_BYTES)
    throw new ImportError('FILE_TOO_LARGE', { maxMb: MAX_IMPORT_BYTES / 1024 / 1024 });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('INVALID_JSON');
  }
  try {
    const { file, migratedFrom } = parseProjectFile(raw);
    const asCopy = idExists(file.project.id);
    const project = asCopy ? { ...file.project, id: ctx.createId('project') } : file.project;
    return {
      project,
      asCopy,
      snapshotCount: file.snapshots?.length ?? 0,
      snapshots: file.snapshots ?? [],
      ...(migratedFrom !== undefined ? { migratedFrom } : {}),
    };
  } catch (error) {
    if (error instanceof ProjectFileError) throw new ImportError(error.code, error.params);
    throw error;
  }
}

/** Backup reminder rule (PRJ-05, docs/05 § 2): ≥ 14 days and ≥ 50 saved changes since export. */
export function needsBackupReminder(
  state: BackupState,
  firstProjectAt: string | undefined,
  now: string,
): boolean {
  const since = state.lastExportAt ?? firstProjectAt;
  if (!since) return false;
  const days = (Date.parse(now) - Date.parse(since)) / 86_400_000;
  return days >= 14 && state.changesSinceExport >= 50;
}
