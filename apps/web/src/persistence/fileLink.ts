import type { Project, Snapshot } from '@server-planner/model';
import { exportFileName, toProjectFile } from './backup';
import type { ProjectRepository } from './repository';

/**
 * PRJ-09 save straight to a file on disk (File System Access API — Chromium browsers). A project
 * linked to a file is written there after every autosave while the browser keeps the permission;
 * the IndexedDB copy stays the working copy. The file handle is kept in the `settings` store
 * (handles are structured-cloneable), so no database upgrade is needed.
 */

interface WritableFile {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}
export interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableFile>;
  queryPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
}
interface PickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
  multiple?: boolean;
}
type PickerWindow = Window & {
  showSaveFilePicker?: (options: PickerOptions) => Promise<FileHandle>;
  showOpenFilePicker?: (options: PickerOptions) => Promise<FileHandle[]>;
};

const TYPES = [
  { description: 'Server Planner project', accept: { 'application/json': ['.json'] } },
];
const key = (projectId: string) => `fileLink:${projectId}`;

export const fileAccessSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof (window as PickerWindow).showSaveFilePicker === 'function' &&
  typeof (window as PickerWindow).showOpenFilePicker === 'function';

export type LinkState = 'synced' | 'permission' | 'error';

export interface FileLink {
  handle: FileHandle;
  name: string;
}

export async function getFileLink(
  repo: Pick<ProjectRepository, 'getSetting'>,
  projectId: string,
): Promise<FileLink | undefined> {
  return repo.getSetting<FileLink>(key(projectId));
}

export async function unlinkFile(
  repo: Pick<ProjectRepository, 'setSetting'>,
  projectId: string,
): Promise<void> {
  await repo.setSetting(key(projectId), undefined);
}

async function write(handle: FileHandle, project: Project, snapshots: Snapshot[]) {
  const writable = await handle.createWritable();
  await writable.write(
    `${JSON.stringify(toProjectFile(project, undefined, snapshots), null, 2)}\n`,
  );
  await writable.close();
}

const snapshotsOf = async (
  repo: Pick<ProjectRepository, 'listSnapshots'>,
  projectId: string,
): Promise<Snapshot[]> =>
  (await repo.listSnapshots(projectId)).map(({ projectId: _, ...s }) => s as Snapshot);

/** "Save to file…": asks where, writes the project and remembers the file for later saves. */
export async function saveToNewFile(
  repo: Pick<ProjectRepository, 'setSetting' | 'listSnapshots'>,
  project: Project,
): Promise<FileLink | undefined> {
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (!picker) return undefined;
  let handle: FileHandle;
  try {
    handle = await picker({ suggestedName: exportFileName(project), types: TYPES });
  } catch {
    return undefined; // cancelled
  }
  await write(handle, project, await snapshotsOf(repo, project.id));
  const link = { handle, name: handle.name };
  await repo.setSetting(key(project.id), link);
  return link;
}

/** After an autosave: writes the linked file when the permission is still granted. */
export async function syncLinkedFile(
  repo: Pick<ProjectRepository, 'getSetting' | 'listSnapshots'>,
  project: Project,
  ask = false,
): Promise<LinkState | undefined> {
  const link = await getFileLink(repo, project.id);
  if (!link) return undefined;
  try {
    let permission = (await link.handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (permission !== 'granted' && ask)
      permission = (await link.handle.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
    if (permission !== 'granted') return 'permission';
    await write(link.handle, project, await snapshotsOf(repo, project.id));
    return 'synced';
  } catch {
    return 'error';
  }
}

/** "Open file…": picks a project file; the caller imports it and links the handle. */
export async function pickProjectFile(): Promise<{ file: File; handle: FileHandle } | undefined> {
  const picker = (window as PickerWindow).showOpenFilePicker;
  if (!picker) return undefined;
  try {
    const [handle] = await picker({ types: TYPES, multiple: false });
    if (!handle) return undefined;
    return { file: await handle.getFile(), handle };
  } catch {
    return undefined;
  }
}

export async function linkFile(
  repo: Pick<ProjectRepository, 'setSetting'>,
  projectId: string,
  handle: FileHandle,
): Promise<void> {
  await repo.setSetting(key(projectId), { handle, name: handle.name } satisfies FileLink);
}
