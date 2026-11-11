import { PROJECT_FILE_FORMAT, type Project, type ProjectFile, SCHEMA_VERSION } from '../../src';

/** Wraps a project as an export file with fixed metadata (stable fixtures). */
export function homeLabFile(project: Project): ProjectFile {
  return {
    format: PROJECT_FILE_FORMAT,
    schemaVersion: SCHEMA_VERSION as 1,
    appVersion: '0.0.0',
    exportedAt: '2026-11-11T12:00:00.000Z',
    project,
  };
}
