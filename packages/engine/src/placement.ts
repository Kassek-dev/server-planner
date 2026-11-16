import { type Id, type Project, runsGuest, type Workload } from '@server-planner/model';
import type { CapacityReport } from './types';

/**
 * CAP-10 placement suggestions on the capacity reports of a project: moves that bring overloaded
 * hosts (CPU or memory at or above the critical threshold) back under the warning threshold, and
 * the upgrades still needed when moves are not enough. VMs and LXC move between Proxmox hosts,
 * containers between devices that run Docker. Greedy and deterministic; codes and numbers only.
 */

export interface PlacementMove {
  workloadId: Id;
  from: Id;
  to: Id;
  cpu: number;
  memoryBytes: number;
}

export type PlacementUpgrade =
  | {
      kind: 'memory';
      deviceId: Id;
      /** Memory to add so the host drops under the warning threshold. */
      addBytes: number;
      /** More than the board takes (maxBytes) — a new host is the way out. */
      exceedsMax: boolean;
    }
  | { kind: 'cpu'; deviceId: Id; addCores: number }
  | { kind: 'storage'; deviceId: Id; poolId: Id; addBytes: number };

export interface PlacementPlan {
  moves: PlacementMove[];
  upgrades: PlacementUpgrade[];
}

const GiB = 1024 ** 3;
const MAX_MOVES = 12;

interface HostState {
  id: Id;
  cpuCap: number;
  cpuUsed: number;
  memCap: number;
  memUsed: number;
  vm: boolean;
  lxc: boolean;
  dockerHost: boolean;
}

/** Workloads directly on a device, with what they take there. */
function movable(project: Project, report: CapacityReport) {
  return report.memory.breakdown
    .filter((b) => b.kind === 'workload' && b.ref.type === 'workload')
    .flatMap((b) => {
      const workload = project.workloads[b.ref.id];
      if (!workload) return [];
      const cpu =
        report.cpu.breakdown.find((c) => c.ref.type === 'workload' && c.ref.id === b.ref.id)
          ?.amount ?? 0;
      return [{ workload, memoryBytes: b.amount, cpu }];
    });
}

const fits = (w: Workload, host: HostState) =>
  w.kind === 'container' ? host.dockerHost : host[w.kind];

export function placementPlan(
  project: Project,
  capacity: Record<Id, CapacityReport>,
): PlacementPlan {
  const { warning, critical } = project.settings.capacityThresholds;
  const reports = Object.values(capacity).filter(
    (r) => r.host.type === 'device' && project.devices[r.host.id],
  );
  const hosts = new Map<Id, HostState>(
    reports.map((r) => {
      const device = project.devices[r.host.id];
      return [
        r.host.id,
        {
          id: r.host.id,
          cpuCap: r.cpu.capacity,
          cpuUsed: r.cpu.used,
          memCap: r.memory.capacity,
          memUsed: r.memory.used,
          vm: runsGuest(device?.os?.osId, 'vm'),
          lxc: runsGuest(device?.os?.osId, 'lxc'),
          dockerHost: !!device?.docker,
        },
      ];
    }),
  );
  const ratio = (used: number, cap: number) => (cap > 0 ? used / cap : used > 0 ? Infinity : 0);
  const overloaded = (h: HostState) =>
    ratio(h.memUsed, h.memCap) >= critical || ratio(h.cpuUsed, h.cpuCap) >= critical;

  const moves: PlacementMove[] = [];
  const moved = new Set<Id>();
  const byName = (id: Id) => project.devices[id]?.name ?? id;
  for (const report of [...reports].sort((a, b) =>
    byName(a.host.id).localeCompare(byName(b.host.id)),
  )) {
    const from = hosts.get(report.host.id);
    if (!from) continue;
    // Largest first: fewer moves bring the host down.
    const candidates = movable(project, report)
      .filter((c) => !moved.has(c.workload.id))
      .sort(
        (a, b) => b.memoryBytes - a.memoryBytes || a.workload.name.localeCompare(b.workload.name),
      );
    for (const c of candidates) {
      if (!overloaded(from) || moves.length >= MAX_MOVES) break;
      const target = [...hosts.values()]
        .filter(
          (h) =>
            h.id !== from.id &&
            fits(c.workload, h) &&
            ratio(h.memUsed + c.memoryBytes, h.memCap) <= warning &&
            ratio(h.cpuUsed + c.cpu, h.cpuCap) <= warning,
        )
        .sort(
          (a, b) =>
            ratio(a.memUsed + c.memoryBytes, a.memCap) -
              ratio(b.memUsed + c.memoryBytes, b.memCap) ||
            byName(a.id).localeCompare(byName(b.id)),
        )[0];
      if (!target) continue;
      moves.push({
        workloadId: c.workload.id,
        from: from.id,
        to: target.id,
        cpu: c.cpu,
        memoryBytes: c.memoryBytes,
      });
      moved.add(c.workload.id);
      from.memUsed -= c.memoryBytes;
      from.cpuUsed -= c.cpu;
      target.memUsed += c.memoryBytes;
      target.cpuUsed += c.cpu;
    }
  }

  const upgrades: PlacementUpgrade[] = [];
  for (const h of hosts.values()) {
    const device = project.devices[h.id];
    if (!device) continue;
    if (ratio(h.memUsed, h.memCap) >= critical) {
      // Round up to whole 8 GiB steps (a common module size).
      const needed = h.memUsed / warning - h.memCap;
      const addBytes = Math.ceil(needed / (8 * GiB)) * 8 * GiB;
      const installed = (device.hardware.memory?.modules ?? []).reduce(
        (s, m) => s + m.sizeBytes * m.count,
        0,
      );
      const max = device.hardware.memory?.maxBytes;
      upgrades.push({
        kind: 'memory',
        deviceId: h.id,
        addBytes,
        exceedsMax: max !== undefined && installed + addBytes > max,
      });
    }
    if (ratio(h.cpuUsed, h.cpuCap) >= critical)
      upgrades.push({
        kind: 'cpu',
        deviceId: h.id,
        addCores: Math.max(1, Math.ceil(h.cpuUsed / warning - h.cpuCap)),
      });
  }
  for (const report of reports)
    for (const pool of report.storage)
      if (ratio(pool.used, pool.capacity) >= critical)
        upgrades.push({
          kind: 'storage',
          deviceId: report.host.id,
          poolId: pool.poolId,
          addBytes: Math.max(0, Math.ceil(pool.used / warning - pool.capacity)),
        });
  return { moves, upgrades };
}
