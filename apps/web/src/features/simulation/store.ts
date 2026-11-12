import type { EntityRef, ReachabilityResult, ServiceVisibility } from '@server-planner/engine';
import type { Project } from '@server-planner/model';
import { create } from 'zustand';

/**
 * Simulation view state (uiStore part, docs/03 § 4.2). The query itself lives in the URL
 * (`?panel=sim&sim=reach&from=…&to=…&proto=…&port=…`, docs/07 § 0); results are derived.
 */

export type Coverage = 'full' | 'partial' | 'none';

export interface SimulationState {
  /** Reachability result highlighted on the canvas (O-08), while the panel is open. */
  highlight: ReachabilityResult | null;
  /** O-09 badges: internet access per device. */
  internetOverlay: boolean;
  /** O-09 badges: services visible from the viewpoint, per hosting device. */
  visible: {
    viewpoint: EntityRef;
    services: ServiceVisibility[];
    byDevice: Record<string, Coverage>;
  } | null;
  reset(): void;
}

export const useSimulation = create<SimulationState>((set) => ({
  highlight: null,
  internetOverlay: false,
  visible: null,
  reset: () => set({ highlight: null, internetOverlay: false, visible: null }),
}));

/** Physical device that ultimately runs an app or workload (cycle-safe). */
export function hostDevice(project: Project, ref: EntityRef): string | undefined {
  let current: { type: string; id: string } | undefined =
    ref.type === 'app' ? project.apps[ref.id]?.runsOn : ref;
  for (let depth = 0; current && depth < 16; depth += 1) {
    if (current.type === 'device') return project.devices[current.id] ? current.id : undefined;
    if (current.type === 'interface') {
      current = project.interfaces[current.id]?.owner;
      continue;
    }
    current = project.workloads[current.id]?.host;
  }
  return undefined;
}

/** Aggregates per-service verdicts into a coverage per hosting device. */
export function coverageByDevice(
  project: Project,
  services: ServiceVisibility[],
): Record<string, Coverage> {
  const counts = new Map<string, { ok: number; total: number }>();
  for (const s of services) {
    const device = hostDevice(project, { type: 'app', id: s.appId });
    if (!device) continue;
    const c = counts.get(device) ?? { ok: 0, total: 0 };
    c.total += 1;
    if (s.result.verdict === 'reachable') c.ok += 1;
    counts.set(device, c);
  }
  return Object.fromEntries(
    [...counts].map(([id, c]) => [id, c.ok === c.total ? 'full' : c.ok > 0 ? 'partial' : 'none']),
  );
}
