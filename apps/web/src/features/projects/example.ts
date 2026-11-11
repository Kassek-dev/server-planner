import { defaultContext, type Project, parseProjectFile } from '@server-planner/model';

/** "Try example project": the home-lab fixture from the docs, loaded lazily (own chunk). */
export async function loadExampleProject(name: string): Promise<Project> {
  const { default: raw } = await import('../../../../../fixtures/schema/v1/home-lab.json');
  const { project } = parseProjectFile(raw).file;
  const now = defaultContext.now();
  return {
    ...project,
    id: defaultContext.createId('project'),
    name,
    createdAt: now,
    updatedAt: now,
  };
}
