import type {
  AppInstance,
  Device,
  HostRef,
  Project,
  StoragePool,
  Workload,
} from '@server-planner/model';
import { type EngineContext, hostedBy } from './context';
import { OS_OVERHEAD } from './defaults';
import type { CapacityReport, EntityRef, ResourceUsage, UsageStatus } from './types';

/**
 * Capacity (docs/01 M9, CAP-01/03): recursive per host, "allocated" mode.
 * CPU: threads × overcommit vs vCPUs; memory: physical × overcommit vs workloads + OS + ZFS ARC;
 * pools: usable (RAID layout, free-space reserve) vs VM disks and volumes.
 */

type Breakdown = ResourceUsage['breakdown'];

export function usageStatus(ratio: number, project: Project): UsageStatus {
  const { warning, critical } = project.settings.capacityThresholds;
  if (ratio > 1) return 'over';
  if (ratio >= critical) return 'critical';
  if (ratio >= warning) return 'warning';
  return 'ok';
}

function usage(capacity: number, breakdown: Breakdown, project: Project): ResourceUsage {
  const used = breakdown.reduce((sum, b) => sum + b.amount, 0);
  const ratio = capacity > 0 ? used / capacity : used > 0 ? Number.POSITIVE_INFINITY : 0;
  return { capacity, used, ratio, status: usageStatus(ratio, project), breakdown };
}

/** Usable bytes of a pool before the free-space reserve. */
export function poolUsableBytes(device: Device, pool: StoragePool): number {
  const sizes = pool.diskIds
    .map((id) => device.hardware.disks.find((d) => d.id === id)?.sizeBytes)
    .filter((s): s is number => s !== undefined);
  if (sizes.length === 0) return 0;
  const n = sizes.length;
  const min = Math.min(...sizes);
  const sum = sizes.reduce((a, b) => a + b, 0);
  switch (pool.layout) {
    case 'single':
    case 'raid0':
      return sum;
    case 'mirror':
      return min;
    case 'raid10':
      return Math.floor(n / 2) * min;
    case 'raid5':
    case 'raidz1':
      return Math.max(0, n - 1) * min;
    case 'raid6':
    case 'raidz2':
      return Math.max(0, n - 2) * min;
    case 'raidz3':
      return Math.max(0, n - 3) * min;
  }
}

/** Resources an app or container asks for: container limits win, else apps' recommended needs. */
function demandOf(
  ctx: EngineContext,
  workload: Workload,
): { cpu: number; memory: number; unbounded: boolean } {
  if (workload.kind !== 'container') {
    return {
      cpu: workload.resources.cpu,
      memory: workload.resources.memoryBytes,
      unbounded: false,
    };
  }
  const apps = hostedBy(ctx, { type: 'workload', id: workload.id })
    .apps.map((id) => ctx.project.apps[id])
    .filter(Boolean) as AppInstance[];
  const fromApps = {
    cpu: apps.reduce((s, a) => s + a.requirements.recommended.cpu, 0),
    memory: apps.reduce((s, a) => s + a.requirements.recommended.memoryBytes, 0),
  };
  return {
    cpu: workload.limits?.cpu ?? fromApps.cpu,
    memory: workload.limits?.memoryBytes ?? fromApps.memory,
    unbounded: workload.limits?.cpu === undefined || workload.limits?.memoryBytes === undefined,
  };
}

function consumers(ctx: EngineContext, host: HostRef) {
  const { workloads, apps } = hostedBy(ctx, host);
  const cpu: Breakdown = [];
  const memory: Breakdown = [];
  for (const id of workloads) {
    const w = ctx.project.workloads[id];
    if (!w) continue;
    const d = demandOf(ctx, w);
    const ref: EntityRef = { type: 'workload', id };
    cpu.push({ ref, amount: d.cpu, kind: 'workload', ...(d.unbounded ? { unbounded: true } : {}) });
    memory.push({
      ref,
      amount: d.memory,
      kind: 'workload',
      ...(d.unbounded ? { unbounded: true } : {}),
    });
  }
  for (const id of apps) {
    const a = ctx.project.apps[id];
    if (!a) continue;
    const ref: EntityRef = { type: 'app', id };
    cpu.push({ ref, amount: a.requirements.recommended.cpu, kind: 'app' });
    memory.push({ ref, amount: a.requirements.recommended.memoryBytes, kind: 'app' });
  }
  return { cpu, memory, workloads };
}

function deviceReport(ctx: EngineContext, device: Device, seen: Set<string>): CapacityReport {
  const { project } = ctx;
  const ref: EntityRef = { type: 'device', id: device.id };
  const host: HostRef = { type: 'device', id: device.id };
  const { cpu, memory, workloads } = consumers(ctx, host);
  const overhead = device.os
    ? (device.os.overrideOverhead ?? OS_OVERHEAD[device.os.osId])
    : undefined;
  if (overhead) {
    cpu.unshift({ ref, amount: overhead.cpu, kind: 'os' });
    memory.unshift({ ref, amount: overhead.memoryBytes, kind: 'os' });
  }
  for (const pool of device.hardware.pools) {
    if (pool.arcBytes)
      memory.push({ ref: { type: 'pool', id: pool.id }, amount: pool.arcBytes, kind: 'zfs-arc' });
  }
  const threads = device.hardware.cpus.reduce((s, c) => s + c.threads, 0);
  const physicalMemory = (device.hardware.memory?.modules ?? []).reduce(
    (s, m) => s + m.sizeBytes * m.count,
    0,
  );
  const { cpu: cpuOver, memory: memOver } = project.settings.defaultOvercommit;

  const storage = device.hardware.pools.map((pool) => {
    const breakdown: Breakdown = [];
    for (const w of Object.values(project.workloads)) {
      if (w.kind !== 'container') {
        const bytes = w.resources.disks
          .filter((d) => d.poolId === pool.id)
          .reduce((s, d) => s + d.sizeBytes, 0);
        if (bytes > 0)
          breakdown.push({ ref: { type: 'workload', id: w.id }, amount: bytes, kind: 'workload' });
      } else {
        const bytes = w.volumes
          .filter((v) => v.poolId === pool.id)
          .reduce((s, v) => s + (v.sizeBytes ?? 0), 0);
        if (bytes > 0)
          breakdown.push({ ref: { type: 'workload', id: w.id }, amount: bytes, kind: 'workload' });
      }
    }
    const capacity = poolUsableBytes(device, pool) * (1 - project.settings.storageFreeReserve);
    return { ...usage(capacity, breakdown, project), poolId: pool.id };
  });

  return {
    host: ref,
    mode: 'allocated',
    cpu: usage(threads * cpuOver, cpu, project),
    memory: usage(physicalMemory * memOver, memory, project),
    storage,
    children: workloads.flatMap((id) => {
      const w = project.workloads[id];
      return w && w.kind !== 'container' && !seen.has(id)
        ? [guestReport(ctx, w, new Set([...seen, id]))]
        : [];
    }),
  };
}

/** VM / LXC: its allocation vs what runs inside (CAP-03). */
function guestReport(
  ctx: EngineContext,
  guest: Exclude<Workload, { kind: 'container' }>,
  seen: Set<string>,
): CapacityReport {
  const { project } = ctx;
  const { cpu, memory, workloads } = consumers(ctx, { type: 'workload', id: guest.id });
  return {
    host: { type: 'workload', id: guest.id },
    mode: 'allocated',
    cpu: usage(guest.resources.cpu, cpu, project),
    memory: usage(guest.resources.memoryBytes, memory, project),
    storage: [],
    children: workloads.flatMap((id) => {
      const w = project.workloads[id];
      return w && w.kind !== 'container' && !seen.has(id)
        ? [guestReport(ctx, w, new Set([...seen, id]))]
        : [];
    }),
  };
}

const memo = new WeakMap<EngineContext, Record<string, CapacityReport>>();

/** Reports for every device that can host something, flattened by host ID (devices and guests). */
export function capacity(ctx: EngineContext): Record<string, CapacityReport> {
  const cached = memo.get(ctx);
  if (cached) return cached;
  const out: Record<string, CapacityReport> = {};
  const collect = (report: CapacityReport) => {
    out[report.host.id] = report;
    for (const child of report.children) collect(child);
  };
  for (const device of Object.values(ctx.project.devices)) {
    const hostsSomething = hostedBy(ctx, { type: 'device', id: device.id });
    if (!device.os && hostsSomething.workloads.length === 0 && hostsSomething.apps.length === 0)
      continue;
    collect(deviceReport(ctx, device, new Set()));
  }
  memo.set(ctx, out);
  return out;
}
