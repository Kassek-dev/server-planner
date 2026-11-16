import type { AnalysisResult } from '@server-planner/engine';
import { type Device, type DiffEntry, diffProjects, type Project } from '@server-planner/model';
import {
  type BomTotals,
  bomTotals,
  hostReports,
  type ResourceTotals,
  resourceTotals,
} from '../dashboard/summary';

/**
 * PRJ-10 variant comparison: what changed against the base project, what the change adds up to
 * (resources, issues, cost) and the parts to buy for it.
 */

/** One purchase the variant implies (`before` / `after` as raw values; the view formats them). */
export type Upgrade =
  | { kind: 'device'; deviceId: string; name: string; model?: string }
  | { kind: 'memory'; deviceId: string; name: string; before: number; after: number }
  | { kind: 'disks'; deviceId: string; name: string; disks: { type: string; sizeBytes: number }[] }
  | { kind: 'gpu'; deviceId: string; name: string; models: string[] }
  | { kind: 'cpu'; deviceId: string; name: string; before: string; after: string };

export interface Side {
  resources: ResourceTotals;
  errors: number;
  warnings: number;
  bom: BomTotals;
  idleW: number;
}

export interface Comparison {
  diff: DiffEntry[];
  base: Side;
  variant: Side;
  upgrades: Upgrade[];
}

const PHYSICAL = (d: Device) => d.kind !== 'internet' && d.kind !== 'client';
const memoryOf = (d: Device) =>
  (d.hardware.memory?.modules ?? []).reduce((s, m) => s + m.sizeBytes * m.count, 0);
const cpuOf = (d: Device) => d.hardware.cpus.map((c) => c.model).join(' + ');

function side(project: Project, result: AnalysisResult | null): Side {
  const issues = result?.issues ?? [];
  return {
    resources: resourceTotals(hostReports(project, result)),
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    bom: bomTotals(project),
    idleW: Object.values(project.devices).reduce((s, d) => s + (d.hardware.power?.idleW ?? 0), 0),
  };
}

/** Parts to buy: new devices, more memory, new disks and GPUs, another CPU. */
export function upgrades(base: Project, variant: Project): Upgrade[] {
  const out: Upgrade[] = [];
  for (const d of Object.values(variant.devices)
    .filter(PHYSICAL)
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const before = base.devices[d.id];
    if (!before) {
      out.push({
        kind: 'device',
        deviceId: d.id,
        name: d.name,
        ...(d.catalogRef ? { model: d.catalogRef.id } : {}),
      });
      continue;
    }
    if (cpuOf(d) && cpuOf(before) && cpuOf(d) !== cpuOf(before))
      out.push({
        kind: 'cpu',
        deviceId: d.id,
        name: d.name,
        before: cpuOf(before),
        after: cpuOf(d),
      });
    if (memoryOf(d) > memoryOf(before))
      out.push({
        kind: 'memory',
        deviceId: d.id,
        name: d.name,
        before: memoryOf(before),
        after: memoryOf(d),
      });
    const oldDisks = new Set(before.hardware.disks.map((x) => x.id));
    const disks = d.hardware.disks
      .filter((x) => !oldDisks.has(x.id))
      .map((x) => ({ type: x.type, sizeBytes: x.sizeBytes }));
    if (disks.length > 0) out.push({ kind: 'disks', deviceId: d.id, name: d.name, disks });
    const oldGpus = before.hardware.gpus.map((g) => g.model);
    const gpus = d.hardware.gpus
      .map((g) => g.model)
      .filter((m) => {
        const i = oldGpus.indexOf(m);
        if (i < 0) return true;
        oldGpus.splice(i, 1);
        return false;
      });
    if (gpus.length > 0) out.push({ kind: 'gpu', deviceId: d.id, name: d.name, models: gpus });
  }
  return out;
}

export function compareProjects(
  base: Project,
  variant: Project,
  baseResult: AnalysisResult | null,
  variantResult: AnalysisResult | null,
): Comparison {
  return {
    diff: diffProjects(base, variant),
    base: side(base, baseResult),
    variant: side(variant, variantResult),
    upgrades: upgrades(base, variant),
  };
}
