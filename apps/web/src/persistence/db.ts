import type { Project } from '@server-planner/model';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

/** IndexedDB layout — docs/02-model-danych.md § 10. Bump DB_VERSION and extend `upgrade` on changes. */

export const DB_NAME = 'server-planner';
export const DB_VERSION = 1;

/** Lightweight row for the projects list (PRJ-02) — avoids loading full projects. */
export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deviceCount: number;
  locationCount: number;
  sizeBytes: number;
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
    },
  });
}
