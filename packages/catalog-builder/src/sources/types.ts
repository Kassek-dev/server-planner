/** Source adapters of the catalog builder — docs/03 § 7.1, docs/06. */

export interface FetchContext {
  /** GET with User-Agent, timeout, retries and a per-source request budget. */
  get(url: string): Promise<Response>;
  /** Downloads to a temporary file and returns its path (large archives). */
  download(url: string, fileName: string): Promise<string>;
  /** Scratch directory for this run. */
  workDir: string;
}

/** A port of a container image as published by a source. */
export interface SourcePort {
  container: number;
  host: number;
  protocol: 'tcp' | 'udp';
  description: string;
  optional: boolean;
}

/** One app fact sheet from one source; merged by `key` (normalised slug). */
export interface AppRecord {
  kind: 'app';
  source: string;
  key: string;
  /** Other keys this record answers to (repository name, image name…). */
  aliases?: string[];
  name?: string;
  description?: string;
  website?: string;
  repository?: string;
  license?: string;
  categories?: string[];
  popularity?: number;
  archived?: boolean;
  image?: {
    name: string;
    tag: string;
    arch: ('amd64' | 'arm64')[];
    ports: SourcePort[];
    volumes: { path: string; description: string; optional: boolean }[];
    /** A desktop application streamed to the browser (KasmVNC "desktop gui"), not a service. */
    desktop?: boolean;
  };
  /** LXC resources (Community Scripts) — scaled for Docker by the heuristics. */
  lxc?: { cpu: number; ramMb: number; diskGb: number; port?: number };
}

/** Median multi-core result of one CPU model (Blender Open Data). */
export interface CpuPerfRecord {
  kind: 'cpu-perf';
  source: string;
  name: string;
  normalized: string;
  /** Median samples/minute per scene. */
  scenes: Record<string, number>;
  samples: number;
}

export type SourceRecord = AppRecord | CpuPerfRecord;

export interface SourceAdapter {
  id: string;
  name: string;
  url: string;
  license: string;
  /** Lower number wins when sources disagree (curated always wins). */
  priority: number;
  fetch(ctx: FetchContext): Promise<unknown>;
  normalize(raw: unknown): Promise<SourceRecord[]> | SourceRecord[];
}

/** "Jellyfin", "linuxserver/jellyfin", "jellyfin-server" → "jellyfin" style keys. */
export function appKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^.*\//, '')
    .replace(/\.git$/, '')
    .replace(/[^a-z0-9]+/g, '');
}
