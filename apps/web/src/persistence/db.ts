import {
  type Project,
  type Snapshot,
  upgradeProjectV1,
  upgradeProjectV3,
} from '@server-planner/model';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { ProjectPreview } from '../features/canvas/preview';

/** IndexedDB layout — docs/02-model-danych.md § 10. Bump DB_VERSION and extend `upgrade` on changes. */

export const DB_NAME = 'server-planner';
export const DB_VERSION = 4;

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
  /** PRJ-10: this project is a variant of another one (its ID); kept across saves. */
  variantOf?: string;
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

export async function openAppDb(
  name: string = DB_NAME,
  /** Called when a newer app version (another tab) waits to upgrade the database. */
  onVersionChange: () => void = () => globalThis.location?.reload(),
): Promise<AppDatabase> {
  const db = await openDB<AppDb>(name, DB_VERSION, {
    // An open older tab would block the upgrade forever: it lets go and reloads instead.
    blocking() {
      db.close();
      onVersionChange();
    },
    async upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        db.createObjectStore('projects', { keyPath: 'id' }).createIndex('by-updated', 'updatedAt');
        db.createObjectStore('projectData', { keyPath: 'id' });
        db.createObjectStore('settings');
      }
      if (oldVersion < 2) {
        db.createObjectStore('snapshots', { keyPath: 'id' }).createIndex('by-project', 'projectId');
      }
      if (oldVersion >= 1 && oldVersion < 3) {
        // Project schema v2 (proxy routes, DNS records): stored projects and snapshots are
        // migrated in place, inside the upgrade transaction.
        let project = await tx.objectStore('projectData').openCursor();
        while (project) {
          await project.update(upgradeProjectV1(project.value as never) as unknown as Project);
          project = await project.continue();
        }
        let snapshot = await tx.objectStore('snapshots').openCursor();
        while (snapshot) {
          const value = snapshot.value;
          await snapshot.update({
            ...value,
            project: upgradeProjectV1(value.project as never) as unknown as Snapshot['project'],
          });
          snapshot = await snapshot.continue();
        }
      }
      if (oldVersion >= 1 && oldVersion < 4) {
        // Project schema v4 (flow scenarios): the same in-place migration. Idempotent, so data
        // just upgraded from v2 passes through safely.
        let project = await tx.objectStore('projectData').openCursor();
        while (project) {
          await project.update(upgradeProjectV3(project.value as never) as unknown as Project);
          project = await project.continue();
        }
        let snapshot = await tx.objectStore('snapshots').openCursor();
        while (snapshot) {
          const value = snapshot.value;
          await snapshot.update({
            ...value,
            project: upgradeProjectV3(value.project as never) as unknown as Snapshot['project'],
          });
          snapshot = await snapshot.continue();
        }
      }
    },
  });
  return db;
}
