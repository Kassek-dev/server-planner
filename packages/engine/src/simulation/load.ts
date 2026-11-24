import type { CatalogFlow, Id, Link } from '@server-planner/model';
import { capacity } from '../capacity';
import { buildContext, type EngineContext, type EngineOptions } from '../context';
import { type FlowTarget, runFlow } from './flow';

/**
 * FLW-06/07 link load: processes running at the same time ("evening: 3 streams + backup") added
 * up on the cables they cross. Each reachable step adds its bandwidth × count to every link of its
 * path. A link carries the speed of its slower end; cables bundled in an LACP / balance-alb bond
 * share the bond's total speed. Numbers only — the UI explains them.
 */

export interface LoadItem {
  flow: CatalogFlow;
  bindings: Record<string, FlowTarget | undefined>;
  count: number;
  /** 1.10: the app whose process this is, and its catalog entry (for its load profile). */
  appId?: Id;
  catalogAppId?: string;
}

/** 1.10: CPU and memory of a host while the scenario runs, against its expected use now. */
export interface HostLoad {
  /** A device, or a VM/LXC (its allocation caps what it passes on to its host). */
  host: { type: 'device' | 'workload'; id: Id };
  cpuRatio: number;
  baselineCpuRatio: number;
  memoryRatio: number;
  baselineMemoryRatio: number;
}

export interface LinkLoad {
  linkId: Id;
  loadMbps: number;
  /** Undefined when neither end states a speed. */
  capacityMbps?: number;
  ratio?: number;
}

export interface ScenarioLoad {
  links: LinkLoad[];
  /** The most loaded link (by ratio, else by load). */
  bottleneck?: Id;
  /** Items whose flow did not get through (blocked or unknown hops are not counted). */
  failed: number;
  /** Hosts whose expected CPU or memory changes with the scenario (apps with a load profile). */
  hosts: HostLoad[];
}

/**
 * FLW-07 × CAP-05: the scenario's count becomes the first parameter of each app's load profile
 * (e.g. 3 streams → transcodes = 3); hosts are compared in the expected mode before and after.
 */
function hostLoad(ctx: EngineContext, items: LoadItem[]): HostLoad[] {
  const perApp = new Map<Id, { count: number; catalogAppId?: string }>();
  for (const item of items) {
    if (!item.appId || !ctx.project.apps[item.appId]) continue;
    const entry = perApp.get(item.appId) ?? { count: 0 };
    entry.count += item.count;
    if (item.catalogAppId) entry.catalogAppId = item.catalogAppId;
    perApp.set(item.appId, entry);
  }
  if (perApp.size === 0) return [];
  const apps = { ...ctx.project.apps };
  let changed = false;
  for (const [appId, { count, catalogAppId }] of perApp) {
    const app = apps[appId];
    if (!app) continue;
    const catalogId = app.catalogRef?.id ?? catalogAppId;
    const profiles = catalogId ? ctx.loadProfiles[catalogId] : undefined;
    const profile =
      profiles?.find((p) => p.id === app.loadProfile?.profileId) ??
      profiles?.find((p) => p.id === 'typical');
    const param = profile?.params?.[0];
    if (!profile || !param || !catalogId) continue;
    apps[appId] = {
      ...app,
      ...(app.catalogRef ? {} : { catalogRef: { id: catalogId, version: '' } }),
      loadProfile: {
        profileId: profile.id,
        params: { ...app.loadProfile?.params, [param.key]: Math.min(param.max, count) },
      },
    };
    changed = true;
  }
  if (!changed) return [];
  const before = capacity(ctx, 'expected');
  const after = capacity(buildContext({ ...ctx.project, apps }, optionsOf(ctx)), 'expected');
  const out: HostLoad[] = [];
  for (const [id, report] of Object.entries(after)) {
    if (report.host.type !== 'device' && report.host.type !== 'workload') continue;
    const base = before[id];
    if (!base) continue;
    if (
      Math.abs(report.cpu.ratio - base.cpu.ratio) < 1e-9 &&
      Math.abs(report.memory.ratio - base.memory.ratio) < 1e-9
    )
      continue;
    out.push({
      host: { type: report.host.type, id },
      cpuRatio: report.cpu.ratio,
      baselineCpuRatio: base.cpu.ratio,
      memoryRatio: report.memory.ratio,
      baselineMemoryRatio: base.memory.ratio,
    });
  }
  return out.sort((a, b) => b.cpuRatio - a.cpuRatio);
}

/** The options a context was built with (to build a changed copy the same way). */
const optionsOf = (ctx: EngineContext): EngineOptions => ({
  osOverhead: ctx.osOverhead,
  loadProfiles: ctx.loadProfiles,
  imageArch: ctx.imageArch,
  osArch: ctx.osArch,
  modelBaselines: ctx.modelBaselines,
  family: ctx.family,
});

function linkSpeed(ctx: EngineContext, link: Link): number | undefined {
  const speeds = [link.a, link.b]
    .map((id) => ctx.project.interfaces[id]?.speedMbps)
    .filter((s): s is number => typeof s === 'number' && s > 0);
  return speeds.length > 0 ? Math.min(...speeds) : undefined;
}

/** Links bundled with this one in a load-sharing bond (on either end), itself included. */
function bundle(ctx: EngineContext, link: Link): Link[] {
  for (const end of [link.a, link.b]) {
    const parentId = ctx.project.interfaces[end]?.parentId;
    const bond = parentId ? ctx.project.interfaces[parentId] : undefined;
    if (bond?.kind !== 'bond' || bond.bond?.mode === 'active-backup') continue;
    const members = Object.values(ctx.project.interfaces).filter((i) => i.parentId === bond.id);
    return members.flatMap((m) => ctx.linksByInterface.get(m.id) ?? []);
  }
  return [link];
}

export function scenarioLoad(ctx: EngineContext, items: LoadItem[]): ScenarioLoad {
  const load = new Map<Id, number>();
  let failed = 0;
  for (const item of items) {
    const run = runFlow(ctx, { flow: item.flow, bindings: item.bindings });
    if (run.verdict !== 'reachable') failed += 1;
    for (const hop of run.hops) {
      if (hop.result.verdict !== 'reachable' || !hop.bandwidthMbps) continue;
      for (const linkId of hop.result.path.links)
        load.set(linkId, (load.get(linkId) ?? 0) + hop.bandwidthMbps * item.count);
    }
  }
  // A bond shares the load of its cables: each member link shows the bundle's total.
  const links: LinkLoad[] = [];
  const seen = new Set<Id>();
  for (const linkId of load.keys()) {
    const link = ctx.project.links[linkId];
    // Virtual links (vNIC ↔ bridge) have no wire to fill.
    if (!link || seen.has(linkId) || link.medium === 'virtual') continue;
    const group = bundle(ctx, link);
    const total = group.reduce((s, l) => s + (load.get(l.id) ?? 0), 0);
    const speeds = group.map((l) => linkSpeed(ctx, l));
    const capacity = speeds.every((s) => s !== undefined)
      ? speeds.reduce((s, v) => (s ?? 0) + (v ?? 0), 0)
      : undefined;
    for (const l of group) {
      seen.add(l.id);
      links.push({
        linkId: l.id,
        loadMbps: total,
        ...(capacity ? { capacityMbps: capacity, ratio: total / capacity } : {}),
      });
    }
  }
  links.sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) || b.loadMbps - a.loadMbps);
  const top = links[0];
  return { links, ...(top ? { bottleneck: top.linkId } : {}), failed, hosts: hostLoad(ctx, items) };
}
