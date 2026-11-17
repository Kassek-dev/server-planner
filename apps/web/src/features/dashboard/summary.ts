import type { AnalysisResult, CapacityReport } from '@server-planner/engine';
import type { Project } from '@server-planner/model';

/** CAP-09 dashboard figures derived from the project and the engine results. */

export interface ResourceTotals {
  hosts: number;
  cores: number;
  memoryBytes: number;
  storageBytes: number;
  /** Allocated share of all hosts together. */
  cpuRatio: number;
  memoryRatio: number;
  storageRatio: number;
}

/** Physical hosts (devices with a capacity report) and their resources together. */
export function hostReports(project: Project, result: AnalysisResult | null): CapacityReport[] {
  if (!result) return [];
  return Object.values(result.capacity)
    .filter((r) => r.host.type === 'device' && project.devices[r.host.id])
    .sort((a, b) =>
      (project.devices[a.host.id]?.name ?? '').localeCompare(
        project.devices[b.host.id]?.name ?? '',
      ),
    );
}

export function resourceTotals(reports: CapacityReport[]): ResourceTotals {
  const sum = (f: (r: CapacityReport) => number) => reports.reduce((s, r) => s + f(r), 0);
  const cores = sum((r) => r.cpu.capacity);
  const memoryBytes = sum((r) => r.memory.capacity);
  const storageBytes = sum((r) => r.storage.reduce((s, p) => s + p.capacity, 0));
  const ratio = (used: number, total: number) => (total > 0 ? used / total : 0);
  return {
    hosts: reports.length,
    cores,
    memoryBytes,
    storageBytes,
    cpuRatio: ratio(
      sum((r) => r.cpu.used),
      cores,
    ),
    memoryRatio: ratio(
      sum((r) => r.memory.used),
      memoryBytes,
    ),
    storageRatio: ratio(
      sum((r) => r.storage.reduce((s, p) => s + p.used, 0)),
      storageBytes,
    ),
  };
}

export interface BomTotals {
  owned: number;
  toBuy: number;
  optional: number;
  /** Price of what is still to buy (required), per currency; devices without a price are counted. */
  toBuyCost: { currency: string; amount: number }[];
  optionalCost: { currency: string; amount: number }[];
  unpriced: number;
}

/** Parts of a device with a purchase state (1.9): RAM modules, disks, GPUs, add-in cards. */
export function partPurchases(device: Project['devices'][string]) {
  const hw = device.hardware;
  return [
    ...(hw.memory?.modules ?? []).map((m) => ({
      kind: 'memory' as const,
      label: '',
      purchase: m.purchase,
      count: m.count,
    })),
    ...hw.disks.map((d) => ({
      kind: 'disk' as const,
      label: d.name,
      purchase: d.purchase,
      count: 1,
    })),
    ...hw.gpus.map((g) => ({
      kind: 'gpu' as const,
      label: g.model,
      purchase: g.purchase,
      count: 1,
    })),
    ...(hw.cards ?? []).map((c) => ({
      kind: 'card' as const,
      label: c.model,
      purchase: c.purchase,
      count: 1,
    })),
  ].filter((p) => p.purchase && p.purchase.status !== 'owned');
}

export function bomTotals(project: Project): BomTotals {
  const out: BomTotals = {
    owned: 0,
    toBuy: 0,
    optional: 0,
    toBuyCost: [],
    optionalCost: [],
    unpriced: 0,
  };
  const add = (list: BomTotals['toBuyCost'], currency: string, amount: number) => {
    const row = list.find((r) => r.currency === currency);
    if (row) row.amount += amount;
    else list.push({ currency, amount });
  };
  for (const d of Object.values(project.devices)) {
    if (d.kind === 'internet' || d.kind === 'client') continue;
    // Parts to buy count on their own (a price applies to `count` identical modules).
    for (const part of partPurchases(d)) {
      const p = part.purchase;
      if (!p) continue;
      if (p.status === 'to-buy') out.toBuy += part.count;
      else out.optional += part.count;
      if (p.price === undefined) out.unpriced += part.count;
      else
        add(
          p.status === 'to-buy' ? out.toBuyCost : out.optionalCost,
          p.currency ?? project.settings.currency,
          p.price * part.count,
        );
    }
    const purchase = d.purchase;
    const status = purchase?.status ?? 'owned';
    if (status === 'owned') {
      out.owned += 1;
      continue;
    }
    if (status === 'to-buy') out.toBuy += 1;
    else out.optional += 1;
    if (purchase?.price === undefined) {
      out.unpriced += 1;
      continue;
    }
    add(
      status === 'to-buy' ? out.toBuyCost : out.optionalCost,
      purchase.currency ?? project.settings.currency,
      purchase.price,
    );
  }
  return out;
}
