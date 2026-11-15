import {
  DEFAULT_PROJECT_SETTINGS,
  type ProjectSettings,
  ProjectSettingsSchema,
} from '@server-planner/model';
import type { ProjectRepository } from '../../persistence/repository';

/** SET-02 settings new projects start with, kept in this browser (settings store). */

const KEY = 'projectDefaults';

export async function loadProjectDefaults(repository: ProjectRepository): Promise<ProjectSettings> {
  // Local data is still validated: anything broken falls back to the built-in defaults.
  const parsed = ProjectSettingsSchema.safeParse(await repository.getSetting(KEY));
  return parsed.success ? parsed.data : structuredClone(DEFAULT_PROJECT_SETTINGS);
}

export async function saveProjectDefaults(
  repository: ProjectRepository,
  settings: ProjectSettings | null,
): Promise<void> {
  await repository.setSetting(KEY, settings ?? undefined);
}

/** Applies a partial change like `project.update` does: `undefined` removes the key. */
export function mergeSettings(
  settings: ProjectSettings,
  changes: Partial<ProjectSettings>,
): ProjectSettings {
  const next: Record<string, unknown> = { ...settings };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return ProjectSettingsSchema.parse(next);
}
