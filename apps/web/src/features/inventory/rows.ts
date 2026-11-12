import type {
  AnalysisResult,
  CapacityReport,
  InternetAccess,
  UsageStatus,
} from '@server-planner/engine';
import type { Catalog, Project } from '@server-planner/model';
import { hostDevice } from '../simulation/store';

/**
 * Rows of the Inventory view (V-03) and of the CSV exports (EXP-04) — one pure source so the
 * table and the files always agree.
 */

const RANK: Record<UsageStatus, number> = { ok: 0, warning: 1, critical: 2, over: 3 };

export function worstUsage(report: CapacityReport | undefined): UsageStatus | undefined {
  if (!report) return undefined;
  return [report.cpu, report.memory, ...report.storage]
    .map((u) => u.status)
    .reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok' as UsageStatus);
}

export interface DeviceRow {
  id: string;
  name: string;
  kind: string;
  locationId: string;
  location: string;
  model: string;
  cpu: string;
  threads: number;
  memoryBytes: number;
  storageBytes: number;
  os: string;
  workloads: number;
  internet: InternetAccess | '';
  capacity: UsageStatus | '';
  tags: string[];
}

export interface WorkloadRow {
  id: string;
  name: string;
  kind: string;
  host: string;
  device: string;
  cpu: number | '';
  memoryBytes: number | '';
  diskBytes: number;
  image: string;
  internet: InternetAccess | '';
  capacity: UsageStatus | '';
  tags: string[];
}

export interface AppRow {
  id: string;
  name: string;
  role: string;
  host: string;
  device: string;
  ports: string;
  cpu: number;
  memoryBytes: number;
  catalog: string;
  confidence: string;
  tags: string[];
}

const OS_NAMES: Record<string, string> = {
  'proxmox-ve': 'Proxmox VE',
  debian: 'Debian',
  'ubuntu-server': 'Ubuntu Server',
  'windows-server': 'Windows Server',
};
export const osName = (osId: string, version: string) =>
  `${OS_NAMES[osId] ?? osId} ${version}`.trim();

const tagNames = (project: Project, ids: string[]) =>
  ids.map((id) => project.tags[id]?.name).filter((n): n is string => !!n);

export function deviceRows(
  project: Project,
  catalog: Catalog | null,
  result: AnalysisResult | null,
): DeviceRow[] {
  const hosted = new Map<string, number>();
  for (const w of Object.values(project.workloads)) {
    const device = hostDevice(project, { type: 'workload', id: w.id });
    if (device) hosted.set(device, (hosted.get(device) ?? 0) + 1);
  }
  return Object.values(project.devices)
    .filter((d) => d.kind !== 'internet')
    .map((d) => {
      const location = d.placement ? project.locations[d.placement.locationId] : undefined;
      const model = d.catalogRef
        ? catalog?.devices.find((m) => m.id === d.catalogRef?.id)
        : undefined;
      const cpus = d.hardware.cpus;
      return {
        id: d.id,
        name: d.name,
        kind: d.kind,
        locationId: location?.id ?? '',
        location: location?.name ?? '',
        model: model ? `${model.vendor} ${model.model}` : (d.catalogRef?.id ?? ''),
        cpu: cpus.map((c) => c.model).join(' + '),
        threads: cpus.reduce((s, c) => s + c.threads, 0),
        memoryBytes: (d.hardware.memory?.modules ?? []).reduce(
          (s, m) => s + m.sizeBytes * m.count,
          0,
        ),
        storageBytes: d.hardware.disks.reduce((s, x) => s + x.sizeBytes, 0),
        os: d.os ? osName(d.os.osId, d.os.version) : '',
        workloads: hosted.get(d.id) ?? 0,
        internet: result?.internet[d.id] ?? '',
        capacity: worstUsage(result?.capacity[d.id]) ?? '',
        tags: tagNames(project, d.tagIds),
      };
    });
}

export function workloadRows(project: Project, result: AnalysisResult | null): WorkloadRow[] {
  return Object.values(project.workloads).map((w) => {
    const host =
      w.host.type === 'device'
        ? project.devices[w.host.id]?.name
        : project.workloads[w.host.id]?.name;
    const device = hostDevice(project, { type: 'workload', id: w.id });
    const guest = w.kind !== 'container';
    return {
      id: w.id,
      name: w.name,
      kind: w.kind,
      host: host ?? '',
      device: device ? (project.devices[device]?.name ?? '') : '',
      cpu: guest ? w.resources.cpu : (w.limits?.cpu ?? ''),
      memoryBytes: guest ? w.resources.memoryBytes : (w.limits?.memoryBytes ?? ''),
      diskBytes: guest
        ? w.resources.disks.reduce((s, d) => s + d.sizeBytes, 0)
        : w.volumes.reduce((s, v) => s + (v.sizeBytes ?? 0), 0),
      image:
        w.kind === 'container'
          ? `${w.image}:${w.tag}`
          : w.kind === 'vm'
            ? osName(w.guestOs.osId, w.guestOs.version)
            : w.template,
      internet: result?.internet[w.id] ?? '',
      capacity: worstUsage(result?.capacity[w.id]) ?? '',
      tags: tagNames(project, w.tagIds),
    };
  });
}

export function appRows(project: Project, catalog: Catalog | null): AppRow[] {
  return Object.values(project.apps).map((a) => {
    const runtime = a.runsOn.type === 'workload' ? project.workloads[a.runsOn.id] : undefined;
    const host = a.runsOn.type === 'device' ? project.devices[a.runsOn.id]?.name : runtime?.name;
    const device = hostDevice(project, { type: 'app', id: a.id });
    const published =
      runtime?.kind === 'container'
        ? runtime.portMappings.map((m) => `${m.hostPort}/${m.protocol}`)
        : a.listeners.map((l) => `${l.port}/${l.protocol}`);
    const entry = a.catalogRef ? catalog?.apps.find((x) => x.id === a.catalogRef?.id) : undefined;
    return {
      id: a.id,
      name: a.name,
      role: a.role ?? 'app',
      host: host ?? '',
      device: device ? (project.devices[device]?.name ?? '') : '',
      ports: published.join(', '),
      cpu: a.requirements.recommended.cpu,
      memoryBytes: a.requirements.recommended.memoryBytes,
      catalog: entry?.name ?? a.catalogRef?.id ?? '',
      confidence: a.confidence,
      tags: tagNames(project, a.tagIds),
    };
  });
}
