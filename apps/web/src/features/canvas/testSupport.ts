import { type Project, parseProjectFile, sequentialContext } from '@server-planner/model';
import raw from '../../../../../fixtures/schema/v1/home-lab.json';
import { createProjectSession } from '../../store/projectSession';

export const homeLab = (): Project => parseProjectFile(raw).file.project;

export function sessionWith(project: Project) {
  const session = createProjectSession({
    repository: { save: async () => ({}) as never, recordChangeSaved: async () => {} },
    ctx: { ...sequentialContext(), createId: sequentialContext().createId },
    autosaveMs: 60_000,
  });
  session.load(project);
  return session;
}

export const deviceByName = (p: Project, name: string) => {
  const d = Object.values(p.devices).find((x) => x.name === name);
  if (!d) throw new Error(`no device ${name}`);
  return d;
};
