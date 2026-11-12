import type { Catalog, CatalogApp, CatalogManifest, CpuPerfFile } from './schema/catalog';
import type { CpuSpec } from './schema/hardware';

/**
 * The effective catalog (docs/03 § 7.3): the curated layer plus what the weekly builder publishes
 * in `catalog/dist`. Pure — used at build time (Vite plugin) and in the browser (updates, CAT-04).
 */

/** "Intel(R) Core(TM) i5-8500T CPU @ 2.10GHz" → "intel core i5-8500t" (Blender Open Data names). */
export function normalizeCpuName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\((r|tm)\)/g, ' ')
    .replace(/\b\d+(st|nd|rd|th) gen\b/g, ' ')
    .replace(/\bcpu\b/g, ' ')
    .replace(/@.*$/, ' ')
    .replace(/\bwith radeon.*$/, ' ')
    .replace(/\b\d+-core processor\b/g, ' ')
    .replace(/\bprocessor\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface CatalogDist {
  manifest: CatalogManifest;
  apps: CatalogApp[];
  perf?: CpuPerfFile;
}

/** Score lookup by normalised CPU name. */
export function perfIndex(
  perf: CpuPerfFile | undefined,
): Map<string, { score: number; samples: number }> {
  return new Map(
    (perf?.cpus ?? []).map((c) => [c.normalized, { score: c.score, samples: c.samples }]),
  );
}

function withPerf<T extends Pick<CpuSpec, 'model' | 'perf'>>(
  cpu: T,
  index: ReturnType<typeof perfIndex>,
): T {
  if (cpu.perf?.source === 'user') return cpu;
  const hit = index.get(normalizeCpuName(cpu.model));
  return hit
    ? { ...cpu, perf: { score: hit.score, source: 'blender-opendata', samples: hit.samples } }
    : cpu;
}

/**
 * Curated + dist: imported apps join the curated ones (curated ids always win), CPUs of the catalog
 * and of its device models get their measured scores, version and sources come from the manifest.
 */
export function withDist(curated: Catalog, dist: CatalogDist | null | undefined): Catalog {
  if (!dist) return curated;
  const ids = new Set(curated.apps.map((a) => a.id));
  const index = perfIndex(dist.perf);
  return {
    ...curated,
    catalogVersion: dist.manifest.catalogVersion,
    generatedAt: dist.manifest.generatedAt,
    apps: [...curated.apps, ...dist.apps.filter((a) => !ids.has(a.id))],
    cpus: curated.cpus.map((c) => withPerf(c, index)),
    devices: curated.devices.map((d) => ({
      ...d,
      hardware: { ...d.hardware, cpus: d.hardware.cpus.map((c) => withPerf(c, index)) },
    })),
    sources: dist.manifest.sources,
  };
}

/** "1.10.0" ≥ "1.9.2" — plain numeric SemVer comparison (no pre-releases). */
export function versionAtLeast(version: string, minimum: string): boolean {
  const a = version.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}
