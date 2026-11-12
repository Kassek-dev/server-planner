import { type DeviceTemplate, DeviceTemplateSchema } from '@server-planner/model';
import { create } from 'zustand';
import type { ProjectRepository } from '../../persistence/repository';

/** LIB-04 own device templates, stored in this browser (settings store), shared by all projects. */

const KEY = 'deviceTemplates';

interface TemplatesState {
  templates: DeviceTemplate[];
  load(repository: ProjectRepository): Promise<void>;
  save(repository: ProjectRepository, template: DeviceTemplate): Promise<void>;
  remove(repository: ProjectRepository, id: string): Promise<void>;
}

export const useDeviceTemplates = create<TemplatesState>((set, get) => ({
  templates: [],
  async load(repository) {
    const raw = await repository.getSetting<unknown[]>(KEY);
    // Local data is still validated: a broken entry is dropped, not trusted.
    const templates = (Array.isArray(raw) ? raw : []).flatMap((t) => {
      const parsed = DeviceTemplateSchema.safeParse(t);
      return parsed.success ? [parsed.data] : [];
    });
    set({ templates });
  },
  async save(repository, template) {
    const templates = [...get().templates.filter((t) => t.id !== template.id), template].sort(
      (a, b) => a.name.localeCompare(b.name),
    );
    await repository.setSetting(KEY, templates);
    set({ templates });
  },
  async remove(repository, id) {
    const templates = get().templates.filter((t) => t.id !== id);
    await repository.setSetting(KEY, templates);
    set({ templates });
  },
}));
