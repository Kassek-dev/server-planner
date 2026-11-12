import type { Project, Snapshot } from '@server-planner/model';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { ProjectPreview } from '../features/canvas/preview';

/** IndexedDB layout — docs/02-model-danych.md § 10. Bump DB_VERSION and extend `upgrade` on changes. */

export const DB_NAME = 'server-planner';
export const DB_VERSION = 2;

/** Lightweight row for the projects list (PRJ-02) — avoids loading full projects. */
export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deviceCount: number;
  locationCount: number;
  sizeBytes: number;
  /** Card thumbnail; absent for empty projects and rows saved before stage 3. */
  preview?: ProjectPreview;
}

/** PRJ-07 snapshot stored per project. */
export interface StoredSnapshot extends Snapshot {
  projectId: string;
}

export interface BackupState {
  lastExportAt?: string;
  /** Saved changes since the last export — drives the backup reminder (PRJ-05). */
  changesSinceExport: number;
}

interface AppDb extends DBSchema {
  projects: { key: string; value: ProjectMeta; indexes: { 'by-updated': string } };
  projectData: { key: string; value: Project };
  settings: { key: string; value: unknown };
  snapshots: { key: string; value: StoredSnapshot; indexes: { 'by-project': string } };
}

export type AppDatabase = IDBPDatabase<AppDb>;

export function openAppDb(name: string = DB_NAME): Promise<AppDatabase> {
  return openDB<AppDb>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('projects', { keyPath: 'id' }).createIndex('by-updated', 'updatedAt');
        db.createObjectStore('projectData', { keyPath: 'id' });
        db.createObjectStore('settings');
      }
      if (oldVersion < 2) {
        db.createObjectStore('snapshots', { keyPath: 'id' }).createIndex('by-project', 'projectId');
      }
    },
  });
}
