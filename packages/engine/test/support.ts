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
import { type AnalysisResult, analyze as analyzeWith } from '../src';

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

const GiB = 1024 ** 3;
/** OS overhead as in catalog/curated/os (the engine receives it from the catalog). */
export const OS_OVERHEAD = {
  'proxmox-ve': { cpu: 0.5, memoryBytes: 1 * GiB, diskBytes: 16e9 },
  debian: { cpu: 0.1, memoryBytes: 0.25 * GiB, diskBytes: 4e9 },
  'ubuntu-server': { cpu: 0.2, memoryBytes: 0.5 * GiB, diskBytes: 6e9 },
  'windows-server': { cpu: 1, memoryBytes: 2 * GiB, diskBytes: 32e9 },
};
export const analyze = (project: Project): AnalysisResult =>
  analyzeWith(project, { osOverhead: OS_OVERHEAD });
