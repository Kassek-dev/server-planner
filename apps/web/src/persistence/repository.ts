import { defaultContext, type ModelContext, type Project } from '@server-planner/model';
import { projectPreview } from '../features/canvas/preview';
import type { AppDatabase, BackupState, ProjectMeta } from './db';

/** Project storage (PRJ-01…03). Writes data and list metadata in one transaction. */
export class ProjectRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly ctx: ModelContext = defaultContext,
  ) {}

  async list(): Promise<ProjectMeta[]> {
    const rows = await this.db.getAllFromIndex('projects', 'by-updated');
    return rows.reverse();
  }

  get(id: string): Promise<Project | undefined> {
    return this.db.get('projectData', id);
  }

  async save(project: Project): Promise<ProjectMeta> {
    const meta = toMeta(project);
    const tx = this.db.transaction(['projects', 'projectData'], 'readwrite');
    await Promise.all([
      tx.objectStore('projectData').put(project),
      tx.objectStore('projects').put(meta),
      tx.done,
    ]);
    return meta;
  }

  async delete(id: string): Promise<void> {
    const tx = this.db.transaction(['projects', 'projectData'], 'readwrite');
    await Promise.all([
      tx.objectStore('projectData').delete(id),
      tx.objectStore('projects').delete(id),
      tx.done,
    ]);
  }

  /** P-02d "Delete all data": every project, its data and the app settings in this browser. */
  async deleteAll(): Promise<void> {
    const tx = this.db.transaction(['projects', 'projectData', 'settings'], 'readwrite');
    await Promise.all([
      tx.objectStore('projects').clear(),
      tx.objectStore('projectData').clear(),
      tx.objectStore('settings').clear(),
      tx.done,
    ]);
  }

  async rename(id: string, name: string): Promise<void> {
    const project = await this.get(id);
    if (!project) throw new Error(`Project ${id} not found`);
    await this.save({ ...project, name, updatedAt: this.ctx.now() });
  }

  /** Copy with a new project ID; entity IDs are project-scoped and stay the same. */
  async duplicate(id: string, name: string): Promise<Project> {
    const project = await this.get(id);
    if (!project) throw new Error(`Project ${id} not found`);
    const now = this.ctx.now();
    const copy: Project = {
      ...project,
      id: this.ctx.createId('project'),
      name,
      createdAt: now,
      updatedAt: now,
    };
    await this.save(copy);
    return copy;
  }

  async exists(id: string): Promise<boolean> {
    return (await this.db.getKey('projects', id)) !== undefined;
  }

  async getBackupState(): Promise<BackupState> {
    return (
      ((await this.db.get('settings', 'backup')) as BackupState | undefined) ?? {
        changesSinceExport: 0,
      }
    );
  }

  async recordChangeSaved(): Promise<void> {
    const state = await this.getBackupState();
    await this.db.put(
      'settings',
      { ...state, changesSinceExport: state.changesSinceExport + 1 },
      'backup',
    );
  }

  async recordExport(at: string = this.ctx.now()): Promise<void> {
    await this.db.put(
      'settings',
      { lastExportAt: at, changesSinceExport: 0 } satisfies BackupState,
      'backup',
    );
  }
}

export function toMeta(project: Project): ProjectMeta {
  const preview = projectPreview(project);
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    deviceCount: Object.values(project.devices).filter((d) => d.kind !== 'internet').length,
    locationCount: Object.keys(project.locations).length,
    sizeBytes: new TextEncoder().encode(JSON.stringify(project)).length,
    ...(preview ? { preview } : {}),
  };
}
