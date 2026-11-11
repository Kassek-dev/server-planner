import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const CURATED_DIR = resolve(import.meta.dirname, '../../../catalog/curated');
export const CURATED_KINDS = ['apps', 'devices', 'cpus', 'os'] as const;

/** Lists curated YAML files per kind (docs/06-zrodla-danych.md, catalog/curated/). */
export async function listCuratedFiles(): Promise<
  Record<(typeof CURATED_KINDS)[number], string[]>
> {
  const entries = await Promise.all(
    CURATED_KINDS.map(async (kind) => {
      const files = await readdir(join(CURATED_DIR, kind));
      return [kind, files.filter((f) => f.endsWith('.yaml'))] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<(typeof CURATED_KINDS)[number], string[]>;
}
