import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { CpuPerfRecord, SourceAdapter } from './types';

/**
 * Blender Open Data (CC0) — multi-core CPU performance from community benchmark runs
 * (docs/06 § 3.1). The ~2 GB JSONL dump is streamed and aggregated on the fly.
 */

export const SCENES = ['monster', 'junkshop', 'classroom'] as const;
/** Fewer results than this → not published (too noisy). */
export const MIN_SAMPLES = 5;

/** "Intel(R) Core(TM) i5-8500T CPU @ 2.10GHz" → "intel core i5-8500t". */
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

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
};

/** Aggregates benchmark lines: median samples/minute per CPU and scene, Blender 3.0 and newer. */
export async function aggregate(lines: AsyncIterable<string>): Promise<CpuPerfRecord[]> {
  const byCpu = new Map<string, { name: string; scenes: Map<string, number[]>; samples: number }>();
  for await (const line of lines) {
    if (!line.includes('"CPU"')) continue;
    let record: { data?: unknown };
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const data = (Array.isArray(record.data) ? record.data[0] : record.data) as
      | {
          device_info?: { device_type?: string; compute_devices?: ({ name?: string } | string)[] };
          blender_version?: { version?: string };
          scene?: { label?: string };
          stats?: { samples_per_minute?: number };
        }
      | undefined;
    if (data?.device_info?.device_type !== 'CPU') continue;
    const major = Number((data.blender_version?.version ?? '').split('.')[0]);
    const scene = data.scene?.label ?? '';
    const spm = data.stats?.samples_per_minute;
    const device = data.device_info.compute_devices?.[0];
    const name = (typeof device === 'string' ? device : device?.name)?.trim();
    if (
      !name ||
      !(major >= 3) ||
      !(SCENES as readonly string[]).includes(scene) ||
      !(spm && spm > 0)
    )
      continue;
    const key = normalizeCpuName(name);
    if (!key) continue;
    let entry = byCpu.get(key);
    if (!entry) {
      entry = { name, scenes: new Map(), samples: 0 };
      byCpu.set(key, entry);
    }
    entry.samples += 1;
    entry.scenes.set(scene, [...(entry.scenes.get(scene) ?? []), spm]);
  }
  return [...byCpu]
    .filter(([, e]) => e.samples >= MIN_SAMPLES)
    .map(([normalized, e]) => ({
      kind: 'cpu-perf' as const,
      source: 'blender',
      name: e.name,
      normalized,
      scenes: Object.fromEntries(
        [...e.scenes].map(([s, v]) => [s, Math.round(median(v) * 100) / 100]),
      ),
      samples: e.samples,
    }))
    .sort((a, b) => a.normalized.localeCompare(b.normalized));
}

async function* unzipLines(archive: string): AsyncIterable<string> {
  const child = spawn('unzip', ['-p', archive, '*.jsonl'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  yield* createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY });
}

export const blenderSource: SourceAdapter = {
  id: 'blender',
  name: 'Blender Open Data',
  url: 'https://opendata.blender.org',
  license: 'CC0 1.0',
  priority: 1,
  async fetch(ctx) {
    return ctx.download(
      'https://opendata.blender.org/snapshots/opendata-latest.zip',
      'blender.zip',
    );
  },
  async normalize(raw) {
    const records = await aggregate(unzipLines(raw as string));
    if (records.length === 0) throw new Error('Blender Open Data: no CPU results');
    return records;
  },
};
