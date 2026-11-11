import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ColorRefSchema,
  CommandError,
  createProject,
  deleteWorkload,
  execute,
  ProjectFileError,
  ProjectSchema,
  parseProjectFile,
  sequentialContext,
  updateWorkload,
} from '../src';
import { buildHomeLab } from './support/home-lab';
import { homeLabFile } from './support/project-file';

const fixturePath = join(import.meta.dirname, '../../../fixtures/schema/v1/home-lab.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

function expectFileError(raw: unknown, code: string) {
  try {
    parseProjectFile(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectFileError);
    expect((error as ProjectFileError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

describe('project file', () => {
  it('parses the v1 home-lab fixture without migration', () => {
    const { file, migratedFrom } = parseProjectFile(fixture);
    expect(migratedFrom).toBeUndefined();
    expect(Object.keys(file.project.devices)).toHaveLength(8);
  });

  it('fixture is up to date with the builder (run `pnpm --filter @server-planner/model fixtures:write`)', () => {
    expect(JSON.parse(JSON.stringify(homeLabFile(buildHomeLab())))).toEqual(fixture);
  });

  it('rejects files that are not projects', () => {
    expectFileError(null, 'NOT_A_PROJECT_FILE');
    expectFileError({ format: 'something-else', schemaVersion: 1 }, 'NOT_A_PROJECT_FILE');
    expectFileError({ ...fixture, schemaVersion: '1' }, 'NOT_A_PROJECT_FILE');
  });

  it('rejects files from a newer app version', () => {
    expectFileError({ ...fixture, schemaVersion: 2 }, 'SCHEMA_TOO_NEW');
  });

  it('reports invalid content with Zod issues', () => {
    const broken = structuredClone(fixture);
    const subnet = Object.values(broken.project.subnets)[0] as { cidr: string };
    subnet.cidr = '192.168.300.0/24';
    try {
      parseProjectFile(broken);
      throw new Error('expected failure');
    } catch (error) {
      expect((error as ProjectFileError).code).toBe('INVALID_PROJECT');
      expect((error as ProjectFileError).issues.some((i) => i.path.includes('cidr'))).toBe(true);
    }
  });
});

describe('schemas', () => {
  it('accepts palette keys and hex colors, nothing else', () => {
    expect(ColorRefSchema.safeParse('pink').success).toBe(true);
    expect(ColorRefSchema.safeParse('#aabbcc').success).toBe(true);
    expect(ColorRefSchema.safeParse('red').success).toBe(false);
    expect(ColorRefSchema.safeParse('#abc').success).toBe(false);
  });

  it('an empty project is valid', () => {
    expect(ProjectSchema.safeParse(createProject('Empty', sequentialContext())).success).toBe(true);
  });
});

describe('hosting cycles (untrusted imports)', () => {
  function withCycle() {
    const file = structuredClone(fixture);
    const [a, b] = Object.values(file.project.workloads) as { id: string; host: unknown }[];
    if (!a || !b) throw new Error('fixture');
    a.host = { type: 'workload', id: b.id };
    b.host = { type: 'workload', id: a.id };
    return { file, a, b };
  }

  it('rejects projects whose workloads host each other', () => {
    expectFileError(withCycle().file, 'INVALID_PROJECT');
  });

  it('commands terminate on cyclic data instead of looping', () => {
    const { file, a } = withCycle();
    const project = file.project;
    expect(() => execute(project, deleteWorkload, { id: a.id }, sequentialContext())).not.toThrow();
    const other = Object.values(project.workloads).find(
      (w) => (w as { id: string }).id !== a.id,
    ) as { id: string };
    expect(() =>
      execute(
        project,
        updateWorkload,
        { id: other.id, changes: { host: { type: 'workload', id: a.id } } },
        sequentialContext(),
      ),
    ).toThrow(CommandError);
  });
});
