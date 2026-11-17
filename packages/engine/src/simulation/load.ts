import type { CatalogFlow, Id, Link } from '@server-planner/model';
import type { EngineContext } from '../context';
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
}

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
  return { links, ...(top ? { bottleneck: top.linkId } : {}), failed };
}
