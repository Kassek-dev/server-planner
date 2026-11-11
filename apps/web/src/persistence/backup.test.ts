import { createProject, PROJECT_FILE_FORMAT, sequentialContext } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import {
  exportFileName,
  ImportError,
  MAX_IMPORT_BYTES,
  needsBackupReminder,
  prepareImport,
  toProjectFile,
} from './backup';

const ctx = sequentialContext();
const project = createProject('Home Lab: Rack #2', ctx);
const fileText = JSON.stringify(toProjectFile(project, '2026-11-11T12:00:00.000Z'));

function importError(text: string): string {
  try {
    prepareImport(text, () => false, ctx);
  } catch (error) {
    if (error instanceof ImportError) return error.code;
    throw error;
  }
  return 'none';
}

describe('export', () => {
  it('builds a safe file name', () => {
    expect(exportFileName(project, '2026-11-11T12:00:00.000Z')).toBe(
      'home-lab-rack-2-2026-11-11.json',
    );
  });
});

describe('import', () => {
  it('round-trips an exported project', () => {
    const result = prepareImport(fileText, () => false, ctx);
    expect(result.project).toEqual(project);
    expect(result.asCopy).toBe(false);
  });

  it('imports as a copy when the id already exists', () => {
    const result = prepareImport(fileText, (id) => id === project.id, ctx);
    expect(result.asCopy).toBe(true);
    expect(result.project.id).not.toBe(project.id);
  });

  it('rejects broken input with readable codes', () => {
    expect(importError('{not json')).toBe('INVALID_JSON');
    expect(importError(JSON.stringify({ hello: 'world' }))).toBe('NOT_A_PROJECT_FILE');
    expect(importError(JSON.stringify({ format: PROJECT_FILE_FORMAT, schemaVersion: 99 }))).toBe(
      'SCHEMA_TOO_NEW',
    );
    expect(importError(' '.repeat(MAX_IMPORT_BYTES + 1))).toBe('FILE_TOO_LARGE');
    const invalid = JSON.parse(fileText);
    invalid.project.name = '';
    expect(importError(JSON.stringify(invalid))).toBe('INVALID_PROJECT');
  });
});

describe('backup reminder', () => {
  const now = '2026-12-01T00:00:00.000Z';
  it('needs both 14 days and 50 changes', () => {
    expect(
      needsBackupReminder(
        { changesSinceExport: 60, lastExportAt: '2026-11-01T00:00:00.000Z' },
        undefined,
        now,
      ),
    ).toBe(true);
    expect(
      needsBackupReminder(
        { changesSinceExport: 10, lastExportAt: '2026-11-01T00:00:00.000Z' },
        undefined,
        now,
      ),
    ).toBe(false);
    expect(
      needsBackupReminder(
        { changesSinceExport: 60, lastExportAt: '2026-11-25T00:00:00.000Z' },
        undefined,
        now,
      ),
    ).toBe(false);
  });
  it('counts from the first project when nothing was exported yet', () => {
    expect(needsBackupReminder({ changesSinceExport: 60 }, '2026-11-01T00:00:00.000Z', now)).toBe(
      true,
    );
    expect(needsBackupReminder({ changesSinceExport: 60 }, undefined, now)).toBe(false);
  });
});
