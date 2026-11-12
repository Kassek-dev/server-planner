import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  type Catalog,
  CatalogAppSchema,
  CatalogCpuSchema,
  CatalogDeviceSchema,
  CatalogOsSchema,
  type CpuSpec,
} from '@server-planner/model';
import { parse } from 'yaml';
import type { z } from 'zod';

export const CURATED_DIR = resolve(import.meta.dirname, '../../../catalog/curated');
export const CURATED_KINDS = ['apps', 'devices', 'cpus', 'os'] as const;
type Kind = (typeof CURATED_KINDS)[number];

/** Lists curated YAML files per kind (docs/06-zrodla-danych.md, catalog/curated/). */
export async function listCuratedFiles(dir = CURATED_DIR): Promise<Record<Kind, string[]>> {
  const entries = await Promise.all(
    CURATED_KINDS.map(async (kind) => {
      const files = await readdir(join(dir, kind));
      return [kind, files.filter((f) => f.endsWith('.yaml')).sort()] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<Kind, string[]>;
}

const UNITS: Record<string, number> = {
  B: 1,
  KB: 1e3,
  MB: 1e6,
  GB: 1e9,
  TB: 1e12,
  KIB: 1024,
  MIB: 1024 ** 2,
  GIB: 1024 ** 3,
  TIB: 1024 ** 4,
};

/** "8 GiB" / "256 GB" / 1024 → bytes (implementation.md § 6: binary for RAM, decimal for disks). */
export function parseSize(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const m = /^\s*(\d+(?:\.\d+)?)\s*([KMGT]i?B|B)\s*$/i.exec(value);
  const unit = m?.[2] ? UNITS[m[2].toUpperCase()] : undefined;
  if (!m?.[1] || unit === undefined) return value; // left for Zod to reject
  return Math.round(Number(m[1]) * unit);
}

/** Converts every `*Bytes` field with a unit string to a number of bytes, recursively. */
export function normalizeSizes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSizes);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        k.endsWith('Bytes') ? parseSize(v) : normalizeSizes(v),
      ]),
    );
  }
  return value;
}

export interface CuratedError {
  file: string;
  message: string;
}

export interface CuratedResult {
  catalog: Catalog;
  errors: CuratedError[];
}

/** ISO year and week of a date, e.g. "2026.46" (docs/02 § 9.1). */
export function isoWeekVersion(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}.${String(week).padStart(2, '0')}`;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}`)
    .join('; ');
}

/**
 * Reads, normalises and validates the curated layer into the catalog the app ships with
 * (CAT-01). Device CPUs are written as `{ ref: <cpu id> }` and resolved here.
 */
export async function loadCurated(
  dir = CURATED_DIR,
  now: Date = new Date(),
): Promise<CuratedResult> {
  const files = await listCuratedFiles(dir);
  const errors: CuratedError[] = [];
  const raw = async (kind: Kind) =>
    Promise.all(
      files[kind].map(async (name) => {
        const file = `${kind}/${name}`;
        try {
          const data = normalizeSizes(parse(await readFile(join(dir, kind, name), 'utf8')));
          return { file, id: basename(name, '.yaml'), data };
        } catch (error) {
          errors.push({ file, message: `YAML: ${(error as Error).message}` });
          return undefined;
        }
      }),
    ).then((list) => list.filter((x) => x !== undefined));

  const check = <S extends z.ZodType>(
    schema: S,
    entry: { file: string; id: string; data: unknown },
  ): z.infer<S> | undefined => {
    const parsed = schema.safeParse(entry.data);
    if (!parsed.success) {
      errors.push({ file: entry.file, message: formatIssues(parsed.error) });
      return undefined;
    }
    const id = (parsed.data as { id: string }).id;
    if (id !== entry.id)
      errors.push({ file: entry.file, message: `id "${id}" must match the file name` });
    return parsed.data;
  };

  const catalogVersion = isoWeekVersion(now);
  const cpus = (await raw('cpus'))
    .map((e) => check(CatalogCpuSchema, e))
    .filter((x) => x !== undefined);
  const cpuById = new Map(cpus.map((c) => [c.id, c]));

  const devices = (await raw('devices'))
    .map((entry) => {
      const data = entry.data as { hardware?: { cpus?: unknown[] } } | null;
      const refs = data?.hardware?.cpus ?? [];
      const resolved: CpuSpec[] = [];
      for (const ref of refs) {
        const id = (ref as { ref?: string } | null)?.ref;
        const cpu = id ? cpuById.get(id) : undefined;
        if (!cpu) {
          errors.push({
            file: entry.file,
            message: `unknown CPU reference ${JSON.stringify(ref)}`,
          });
          continue;
        }
        const { id: _id, vendor: _vendor, source: _source, confidence: _c, ...spec } = cpu;
        resolved.push({ ...spec, catalogRef: { id: cpu.id, version: catalogVersion } });
      }
      const withCpus = data?.hardware
        ? { ...data, hardware: { ...data.hardware, cpus: resolved } }
        : data;
      return check(CatalogDeviceSchema, { ...entry, data: withCpus });
    })
    .filter((x) => x !== undefined);

  const apps = (await raw('apps'))
    .map((e) => check(CatalogAppSchema, e))
    .filter((x) => x !== undefined);
  const os = (await raw('os')).map((e) => check(CatalogOsSchema, e)).filter((x) => x !== undefined);

  return {
    catalog: {
      format: 'server-planner/catalog',
      catalogVersion,
      generatedAt: now.toISOString(),
      apps: apps.sort((a, b) => a.name.localeCompare(b.name)),
      devices,
      cpus,
      os,
    },
    errors,
  };
}
