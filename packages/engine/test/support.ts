import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Command,
  createId,
  execute,
  type ModelContext,
  type Project,
  parseProjectFile,
} from '@server-planner/model';

const raw = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../fixtures/schema/v1/home-lab.json'), 'utf8'),
);
export const homeLab = (): Project => parseProjectFile(raw).file.project;

const ctx: ModelContext = { createId, now: () => '2026-11-12T08:00:00.000Z' };
export function apply<P, R>(project: Project, command: Command<P, R>, payload: P): Project {
  return execute(project, command, payload, ctx).project;
}

export const byName = (p: Project, name: string) => {
  const d = Object.values(p.devices).find((x) => x.name === name);
  if (!d) throw new Error(`no ${name}`);
  return d;
};
export const ifaceOf = (p: Project, device: string, name: string) => {
  const owner = byName(p, device).id;
  const i = Object.values(p.interfaces).find((x) => x.owner.id === owner && x.name === name);
  if (!i) throw new Error(`no ${device}:${name}`);
  return i;
};
