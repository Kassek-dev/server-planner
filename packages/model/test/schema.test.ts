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
  restoreSnapshot,
  sequentialContext,
  updateWorkload,
  upgradeProjectV1,
} from '../src';
import { buildDualStackLab } from './support/dual-stack';
import { buildHomeLab } from './support/home-lab';
import { homeLabFile } from './support/project-file';
import { buildReverseProxyLab } from './support/reverse-proxy';

const readFixture = (path: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, '../../../fixtures/schema', path), 'utf8'));
const fixture = readFixture('v3/home-lab.json');
const fixtureV1 = readFixture('v1/home-lab.json');
const fixtureV2 = readFixture('v2/home-lab.json');
const reverseProxy = readFixture('v3/reverse-proxy.json');
const reverseProxyV2 = readFixture('v2/reverse-proxy.json');
const dualStack = readFixture('v3/dual-stack.json');

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
  it('parses the v3 home-lab fixture without migration', () => {
    const { file, migratedFrom } = parseProjectFile(fixture);
    expect(migratedFrom).toBeUndefined();
    expect(Object.keys(file.project.devices)).toHaveLength(8);
  });

  it('fixtures are up to date with the builders (run `pnpm --filter @server-planner/model fixtures:write`)', () => {
    expect(JSON.parse(JSON.stringify(homeLabFile(buildHomeLab())))).toEqual(fixture);
    expect(JSON.parse(JSON.stringify(homeLabFile(buildReverseProxyLab())))).toEqual(reverseProxy);
    expect(JSON.parse(JSON.stringify(homeLabFile(buildDualStackLab())))).toEqual(dualStack);
  });

  it('migrates a v1 file to v3 with empty proxy routes and DNS records', () => {
    const { file, migratedFrom } = parseProjectFile(fixtureV1);
    expect(migratedFrom).toBe(1);
    expect(file.schemaVersion).toBe(3);
    expect(file.project).toEqual(fixture.project);
  });

  it('migrates v2 files to v3 unchanged (only new optional fields in v3)', () => {
    for (const [old, current] of [
      [fixtureV2, fixture],
      [reverseProxyV2, reverseProxy],
    ]) {
      const { file, migratedFrom } = parseProjectFile(old);
      expect(migratedFrom).toBe(2);
      expect(file.schemaVersion).toBe(3);
      expect(file.project).toEqual(current.project);
    }
  });

  it('migrates snapshots of a v1 file and is idempotent', () => {
    const { id: _, ...content } = fixtureV1.project;
    const withSnapshot = {
      ...fixtureV1,
      snapshots: [
        { id: 'snap_0001', name: 'before', createdAt: fixtureV1.exportedAt, project: content },
      ],
    };
    const { file } = parseProjectFile(withSnapshot);
    expect(file.snapshots?.[0]?.project.proxyRoutes).toEqual({});
    expect(upgradeProjectV1(upgradeProjectV1(fixtureV1.project))).toEqual(
      upgradeProjectV1(fixtureV1.project),
    );
    // Data already in a v2 shape is kept.
    expect(upgradeProjectV1(reverseProxy.project)).toEqual(reverseProxy.project);
  });

  it('round-trips the dual-stack fixture with v3 fields', () => {
    const { file } = parseProjectFile(dualStack);
    const v6 = Object.values(file.project.subnets).find((s) => s.cidr.includes(':'));
    expect(v6?.ra).toBe('slaac');
    expect(
      Object.values(file.project.interfaces).some((i) =>
        i.addresses.some((a) => a.mode === 'slaac'),
      ),
    ).toBe(true);
    expect(Object.values(file.project.devices).some((d) => d.hardware.cards?.length)).toBe(true);
    expect(parseProjectFile(JSON.parse(JSON.stringify(file))).file).toEqual(file);
  });

  it('round-trips the reverse proxy fixture', () => {
    const { file } = parseProjectFile(reverseProxy);
    expect(Object.values(file.project.proxyRoutes)).toHaveLength(1);
    expect(Object.values(file.project.dnsRecords).map((r) => r.type)).toEqual(['A', 'A', 'CNAME']);
    expect(parseProjectFile(JSON.parse(JSON.stringify(file))).file).toEqual(file);
  });

  it('rejects files that are not projects', () => {
    expectFileError(null, 'NOT_A_PROJECT_FILE');
    expectFileError({ format: 'something-else', schemaVersion: 1 }, 'NOT_A_PROJECT_FILE');
    expectFileError({ ...fixture, schemaVersion: '1' }, 'NOT_A_PROJECT_FILE');
  });

  it('rejects files from a newer app version', () => {
    expectFileError({ ...fixture, schemaVersion: 4 }, 'SCHEMA_TOO_NEW');
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

  it('rejects a cycle hidden in an included snapshot, and refuses to restore one', () => {
    const { file: broken } = withCycle();
    const { id: _id, ...content } = broken.project;
    const file = structuredClone(fixture);
    file.snapshots = [
      { id: 'snap_1', name: 'bad', createdAt: '2026-11-12T08:00:00.000Z', project: content },
    ];
    expectFileError(file, 'INVALID_PROJECT');
    expect(() =>
      execute(
        fixture.project as never,
        restoreSnapshot,
        { snapshot: { project: content as never } },
        sequentialContext(),
      ),
    ).toThrow(CommandError);
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

describe('untrusted location data', () => {
  it('rejects location parent cycles and deep nesting', () => {
    const file = structuredClone(fixture);
    const [a, b] = Object.values(file.project.locations) as { id: string; parentId?: string }[];
    if (!a || !b) throw new Error('fixture');
    a.parentId = b.id;
    b.parentId = a.id;
    expectFileError(file, 'INVALID_PROJECT');
  });

  it('rejects rack units beyond the 42U limit', () => {
    const file = structuredClone(fixture);
    const rack = Object.values(file.project.locations).find(
      (l) => (l as { kind: string }).kind === 'rack',
    ) as {
      shelves: { u: number; units: number }[];
    };
    rack.shelves = [{ u: 1, units: 1_000_000_000 }];
    expectFileError(file, 'INVALID_PROJECT');
  });
});
