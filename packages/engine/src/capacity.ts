import type {
  AppInstance,
  Device,
  HostRef,
  Project,
  StoragePool,
  Workload,
} from '@server-planner/model';
import { type EngineContext, hostedBy } from './context';
import type { CapacityReport, EntityRef, ResourceUsage, UsageStatus } from './types';

/**
 * Capacity (docs/01 M9, CAP-01/03/05/06): recursive per host.
 * "allocated": CPU threads × overcommit vs vCPUs; memory physical × overcommit vs workloads + OS +
 * ZFS ARC. "expected": the same hosts against threads and physical memory, with apps at their load
 * profile (SW-08) and VMs/LXCs at what runs inside them (never above their allocation).
 * Pools: usable (RAID layout, free-space reserve) vs VM disks and volumes, with growth forecast.
 */

type Breakdown = ResourceUsage['breakdown'];
export type CapacityMode = CapacityReport['mode'];
interface Demand {
  cpu: number;
  memory: number;
  unbounded: boolean;
}

/**
 * What an app is expected to use (SW-08): its load profile (default "typical") with parameters,
 * else its recommended requirements.
 */
export function expectedAppResources(ctx: EngineContext, app: AppInstance): Demand {
  // Stack members share the catalog ref; the profile describes the main service only.
  const main = app.role === undefined || app.role === 'app';
  const profiles = app.catalogRef && main ? ctx.loadProfiles[app.catalogRef.id] : undefined;
  const profile =
    profiles?.find((p) => p.id === app.loadProfile?.profileId) ??
    profiles?.find((p) => p.id === 'typical');
  if (!profile)
    return {
      cpu: app.requirements.recommended.cpu,
      memory: app.requirements.recommended.memoryBytes,
      unbounded: false,
    };
  let cpu = profile.resources.cpu;
  let memory = profile.resources.memoryBytes;
  for (const param of profile.params ?? []) {
    const value = app.loadProfile?.params?.[param.key] ?? param.default;
    const per = profile.perParam?.[param.key];
    cpu += (per?.cpu ?? 0) * (value - param.default);
    memory += (per?.memoryBytes ?? 0) * (value - param.default);
  }
  return { cpu: Math.max(0, cpu), memory: Math.max(0, memory), unbounded: false };
}

const appDemand = (ctx: EngineContext, app: AppInstance, mode: CapacityMode): Demand =>
  mode === 'expected'
    ? expectedAppResources(ctx, app)
    : {
        cpu: app.requirements.recommended.cpu,
        memory: app.requirements.recommended.memoryBytes,
        unbounded: false,
      };

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

/**
 * Resources a workload takes from its host: container limits win, else its apps' needs; in the
 * expected mode a VM/LXC counts with what runs inside (plus guest OS), capped by its allocation.
 */
function demandOf(
  ctx: EngineContext,
  workload: Workload,
  mode: CapacityMode,
  seen: Set<string>,
): Demand {
  if (workload.kind !== 'container') {
    const allocated = {
      cpu: workload.resources.cpu,
      memory: workload.resources.memoryBytes,
      unbounded: false,
    };
    if (mode === 'allocated' || seen.has(workload.id)) return allocated;
    const inner = consumers(
      ctx,
      { type: 'workload', id: workload.id },
      mode,
      new Set([...seen, workload.id]),
    );
    const os =
      workload.kind === 'vm'
        ? (workload.guestOs.overrideOverhead ?? ctx.osOverhead[workload.guestOs.osId])
        : undefined;
    const cpu = inner.cpu.reduce((s, b) => s + b.amount, os?.cpu ?? 0);
    const memory = inner.memory.reduce((s, b) => s + b.amount, os?.memoryBytes ?? 0);
    return {
      cpu: Math.min(allocated.cpu, cpu),
      memory: Math.min(allocated.memory, memory),
      unbounded: false,
    };
  }
  const apps = hostedBy(ctx, { type: 'workload', id: workload.id })
    .apps.map((id) => ctx.project.apps[id])
    .filter(Boolean) as AppInstance[];
  const fromApps = apps.reduce(
    (sum, a) => {
      const d = appDemand(ctx, a, mode);
      return { cpu: sum.cpu + d.cpu, memory: sum.memory + d.memory };
    },
    { cpu: 0, memory: 0 },
  );
  const cap = (limit: number | undefined, value: number) =>
    limit === undefined ? value : mode === 'expected' ? Math.min(limit, value) : limit;
  return {
    cpu: cap(workload.limits?.cpu, fromApps.cpu),
    memory: cap(workload.limits?.memoryBytes, fromApps.memory),
    unbounded: workload.limits?.cpu === undefined || workload.limits?.memoryBytes === undefined,
  };
}

function consumers(ctx: EngineContext, host: HostRef, mode: CapacityMode, seen: Set<string>) {
  const { workloads, apps } = hostedBy(ctx, host);
  const cpu: Breakdown = [];
  const memory: Breakdown = [];
  for (const id of workloads) {
    const w = ctx.project.workloads[id];
    if (!w) continue;
    const d = demandOf(ctx, w, mode, seen);
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
    const d = appDemand(ctx, a, mode);
    cpu.push({ ref, amount: d.cpu, kind: 'app' });
    memory.push({ ref, amount: d.memory, kind: 'app' });
  }
  return { cpu, memory, workloads };
}

function deviceReport(
  ctx: EngineContext,
  device: Device,
  mode: CapacityMode,
  seen: Set<string>,
): CapacityReport {
  const { project } = ctx;
  const ref: EntityRef = { type: 'device', id: device.id };
  const host: HostRef = { type: 'device', id: device.id };
  const { cpu, memory, workloads } = consumers(ctx, host, mode, seen);
  const overhead = device.os
    ? (device.os.overrideOverhead ?? ctx.osOverhead[device.os.osId])
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
  // Expected use is measured against the real hardware, without overcommit.
  const { cpu: cpuOver, memory: memOver } =
    mode === 'expected' ? { cpu: 1, memory: 1 } : project.settings.defaultOvercommit;

  const storage = device.hardware.pools.map((pool) => {
    const breakdown: Breakdown = [];
    let growth = 0;
    for (const w of Object.values(project.workloads)) {
      if (w.kind !== 'container') {
        const bytes = w.resources.disks
          .filter((d) => d.poolId === pool.id)
          .reduce((s, d) => s + d.sizeBytes, 0);
        if (bytes > 0)
          breakdown.push({ ref: { type: 'workload', id: w.id }, amount: bytes, kind: 'workload' });
      } else {
        const volumes = w.volumes.filter((v) => v.poolId === pool.id);
        const bytes = volumes.reduce((s, v) => s + (v.sizeBytes ?? 0), 0);
        growth += volumes.reduce((s, v) => s + (v.growthBytesPerMonth ?? 0), 0);
        if (bytes > 0)
          breakdown.push({ ref: { type: 'workload', id: w.id }, amount: bytes, kind: 'workload' });
      }
    }
    const capacity = poolUsableBytes(device, pool) * (1 - project.settings.storageFreeReserve);
    const used = usage(capacity, breakdown, project);
    // CAP-06: months until the pool fills at the planned data growth.
    const forecast =
      growth > 0
        ? { growthPerMonth: growth, monthsToFull: Math.max(0, capacity - used.used) / growth }
        : {};
    return { ...used, poolId: pool.id, ...forecast };
  });

  return {
    host: ref,
    mode,
    cpu: usage(threads * cpuOver, cpu, project),
    memory: usage(physicalMemory * memOver, memory, project),
    storage,
    children: workloads.flatMap((id) => {
      const w = project.workloads[id];
      return w && w.kind !== 'container' && !seen.has(id)
        ? [guestReport(ctx, w, mode, new Set([...seen, id]))]
        : [];
    }),
  };
}

/** VM / LXC: its allocation vs what runs inside (CAP-03). */
function guestReport(
  ctx: EngineContext,
  guest: Exclude<Workload, { kind: 'container' }>,
  mode: CapacityMode,
  seen: Set<string>,
): CapacityReport {
  const { project } = ctx;
  const { cpu, memory, workloads } = consumers(ctx, { type: 'workload', id: guest.id }, mode, seen);
  return {
    host: { type: 'workload', id: guest.id },
    mode,
    cpu: usage(guest.resources.cpu, cpu, project),
    memory: usage(guest.resources.memoryBytes, memory, project),
    storage: [],
    children: workloads.flatMap((id) => {
      const w = project.workloads[id];
      return w && w.kind !== 'container' && !seen.has(id)
        ? [guestReport(ctx, w, mode, new Set([...seen, id]))]
        : [];
    }),
  };
}

const memo: Record<CapacityMode, WeakMap<EngineContext, Record<string, CapacityReport>>> = {
  allocated: new WeakMap(),
  expected: new WeakMap(),
};

/** Reports for every device that can host something, flattened by host ID (devices and guests). */
export function capacity(
  ctx: EngineContext,
  mode: CapacityMode = 'allocated',
): Record<string, CapacityReport> {
  const cached = memo[mode].get(ctx);
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
    collect(deviceReport(ctx, device, mode, new Set()));
  }
  memo[mode].set(ctx, out);
  return out;
}
