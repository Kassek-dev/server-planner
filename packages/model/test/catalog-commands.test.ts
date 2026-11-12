import { describe, expect, it } from 'vitest';
import {
  addAppFromCatalog,
  addDevice,
  applyDeviceModel,
  type CatalogApp,
  CatalogAppSchema,
  type CatalogDevice,
  CatalogDeviceSchema,
  type Command,
  CommandError,
  connectInterfaces,
  createId,
  createProject,
  execute,
  type ModelContext,
  type Project,
  ProjectSchema,
  publishedPorts,
} from '../src';
import { buildHomeLab } from './support/home-lab';

const ctx: ModelContext = { createId, now: () => '2026-11-12T08:00:00.000Z' };
const GiB = 1024 ** 3;

function run<P, R>(project: Project, command: Command<P, R>, payload: P) {
  const out = execute(project, command, payload, ctx);
  const check = ProjectSchema.safeParse(out.project);
  if (!check.success) throw new Error(JSON.stringify(check.error.issues, null, 2));
  return out;
}

const cpu = { model: 'Intel Core i5-8500T', cores: 6, threads: 6, arch: 'amd64' as const };
const miniPc: CatalogDevice = CatalogDeviceSchema.parse({
  id: 'lenovo-m720q',
  kind: 'mini-pc',
  vendor: 'Lenovo',
  model: 'ThinkCentre M720q Tiny',
  formFactor: { mount: 'standalone', shape: 'mini-pc' },
  hardware: {
    cpus: [{ ...cpu, catalogRef: { id: 'intel-core-i5-8500t', version: '2026.46' } }],
    memory: {
      type: 'DDR4',
      slotsTotal: 2,
      maxBytes: 64 * GiB,
      modules: [{ sizeBytes: 8 * GiB, count: 1 }],
    },
    gpus: [],
    defaultDisks: [{ name: 'nvme0', type: 'ssd-nvme', sizeBytes: 256e9 }],
  },
  ports: [{ name: 'eth0', kind: 'rj45', speedMbps: 1000 }],
  source: ['curated'],
  confidence: 'curated',
});

const stackApp: CatalogApp = CatalogAppSchema.parse({
  id: 'photos',
  name: 'Photos',
  description: { en: 'Photo app' },
  categories: ['photos'],
  source: ['curated'],
  confidence: 'curated',
  deployment: {
    kind: 'stack',
    components: [
      {
        key: 'server',
        name: 'photos-server',
        role: 'app',
        image: 'example/photos',
        defaultTag: 'release',
        arch: ['amd64'],
        platform: 'linux',
        listeners: [{ port: 2283, protocol: 'tcp', purpose: 'web-ui' }],
        defaultPortMappings: [{ hostPort: 2283, containerPort: 2283, protocol: 'tcp' }],
        volumes: [
          { name: 'library', containerPath: '/upload', purpose: 'media', defaultSizeBytes: 500e9 },
        ],
      },
      {
        key: 'db',
        name: 'postgres',
        role: 'database',
        image: 'postgres',
        defaultTag: '16',
        arch: ['amd64'],
        platform: 'linux',
        listeners: [{ port: 5432, protocol: 'tcp', purpose: 'postgresql' }],
        volumes: [{ name: 'pgdata', containerPath: '/var/lib/postgresql/data', purpose: 'data' }],
      },
    ],
  },
  requirements: {
    min: { cpu: 2, memoryBytes: 4 * GiB, diskBytes: 10e9 },
    recommended: { cpu: 4, memoryBytes: 6 * GiB, diskBytes: 20e9 },
  },
  dependencies: [{ capability: 'postgresql', optional: false, providedByComponent: 'db' }],
  trafficPatterns: [
    {
      id: 'web',
      direction: 'inbound',
      peer: { kind: 'lan-clients' },
      protocol: 'tcp',
      port: 2283,
      purpose: 'web-ui',
      required: true,
    },
  ],
  flows: [],
});

describe('device.applyModel', () => {
  it('copies hardware, disks and ports and keeps cables on kept ports', () => {
    let p = createProject('Lab', ctx);
    const pc = run(p, addDevice, { kind: 'mini-pc' });
    p = pc.project;
    const sw = run(p, addDevice, { kind: 'switch' });
    p = sw.project;
    const [eth0] = pc.result.interfaceIds;
    const [port1] = sw.result.interfaceIds;
    p = run(p, connectInterfaces, { a: eth0 as string, b: port1 as string }).project;

    p = run(p, applyDeviceModel, {
      id: pc.result.deviceId,
      model: miniPc,
      catalogVersion: '2026.46',
    }).project;
    const device = p.devices[pc.result.deviceId];
    expect(device?.catalogRef).toEqual({ id: 'lenovo-m720q', version: '2026.46' });
    expect(device?.hardware.cpus[0]?.threads).toBe(6);
    expect(device?.hardware.memory?.maxBytes).toBe(64 * GiB);
    expect(device?.hardware.disks).toHaveLength(1);
    expect(p.interfaces[eth0 as string]).toMatchObject({ name: 'eth0', speedMbps: 1000 });
    expect(Object.values(p.links)).toHaveLength(1);
  });

  it('rejects a model of another kind', () => {
    const p = createProject('Lab', ctx);
    const nas = run(p, addDevice, { kind: 'nas' });
    expect(() =>
      execute(
        nas.project,
        applyDeviceModel,
        { id: nas.result.deviceId, model: miniPc, catalogVersion: 'x' },
        ctx,
      ),
    ).toThrow(CommandError);
  });

  it('a rack device that becomes standalone leaves its rack slot', () => {
    const lab = buildHomeLab();
    const sw = Object.values(lab.devices).find((d) => d.name === 'sw-core');
    if (!sw) throw new Error('no sw-core');
    expect(sw.placement?.u).toBeDefined();
    const desktop: CatalogDevice = {
      ...miniPc,
      id: 'desk-switch',
      kind: 'switch',
      hardware: { cpus: [], gpus: [] },
      formFactor: { mount: 'standalone', shape: 'desktop' },
      ports: [{ name: 'Port 1', kind: 'rj45', speedMbps: 1000 }],
    };
    const p = run(lab, applyDeviceModel, {
      id: sw.id,
      model: desktop,
      catalogVersion: '2026.46',
    }).project;
    expect(p.devices[sw.id]?.placement?.u).toBeUndefined();
    // Port 1 keeps its cable; unconnected surplus ports are removed, connected ones stay.
    const ports = Object.values(p.interfaces).filter((i) => i.owner.id === sw.id);
    const linked = new Set(Object.values(p.links).flatMap((l) => [l.a, l.b]));
    expect(ports.every((i) => i.name === 'Port 1' || linked.has(i.id))).toBe(true);
  });
});

describe('app.addFromCatalog', () => {
  it('adds a stack with a container and an app per component, wired dependencies', () => {
    const lab = buildHomeLab();
    const vm = Object.values(lab.workloads).find((w) => w.name === 'docker-vm');
    if (!vm) throw new Error('no docker-vm');
    const out = run(lab, addAppFromCatalog, {
      app: stackApp,
      catalogVersion: '2026.46',
      host: { type: 'workload', id: vm.id },
    });
    const p = out.project;
    expect(out.result.workloadIds).toHaveLength(2);
    const stack = p.stacks[out.result.stackId ?? ''];
    expect(stack?.catalogRef).toEqual({ id: 'photos', version: '2026.46' });
    const [server, db] = out.result.workloadIds.map((id) => p.workloads[id]);
    expect(server).toMatchObject({ kind: 'container', image: 'example/photos', tag: 'release' });
    expect(server?.kind === 'container' && server.portMappings).toEqual([
      { hostPort: 2283, containerPort: 2283, protocol: 'tcp' },
    ]);
    expect(db?.kind === 'container' && db.portMappings).toEqual([]);
    // Reuses the VM's existing bridge network.
    expect(server?.kind === 'container' && server.network).toMatchObject({
      mode: 'docker-network',
    });
    const [main, dbApp] = out.result.appIds.map((id) => p.apps[id]);
    expect(main?.requirements.recommended.cpu).toBe(4);
    expect(main?.dependencies[0]).toMatchObject({
      capability: 'postgresql',
      satisfiedBy: dbApp?.id,
    });
    expect(dbApp?.role).toBe('database');
    expect(publishedPorts(p, { type: 'workload', id: vm.id }).map((m) => m.hostPort)).toContain(
      2283,
    );
  });

  it('enables Docker and creates a bridge network on a bare host, with custom ports and volumes', () => {
    let p = createProject('Lab', ctx);
    const nas = run(p, addDevice, { kind: 'nas' });
    p = nas.project;
    const host = { type: 'device' as const, id: nas.result.deviceId };
    const out = run(p, addAppFromCatalog, {
      app: stackApp,
      catalogVersion: '2026.46',
      host,
      options: {
        ports: { server: [{ hostPort: 8443, containerPort: 2283, protocol: 'tcp' }] },
        volumes: { 'server/library': { sizeBytes: 1e12 } },
      },
    });
    p = out.project;
    expect(p.devices[host.id]?.docker?.networkIds).toHaveLength(1);
    const server = p.workloads[out.result.workloadIds[0] ?? ''];
    expect(server?.kind === 'container' && server.portMappings[0]?.hostPort).toBe(8443);
    expect(server?.kind === 'container' && server.volumes[0]?.sizeBytes).toBe(1e12);

    // Adding the same app again keeps names unique.
    const again = run(p, addAppFromCatalog, { app: stackApp, catalogVersion: '2026.46', host });
    expect(again.project.workloads[again.result.workloadIds[0] ?? '']?.name).toBe(
      'photos-server-2',
    );
    expect(again.project.apps[again.result.appIds[0] ?? '']?.name).toBe('Photos-2');
  });
});
