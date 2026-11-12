import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  CatalogAppSchema,
  type CatalogDist,
  CatalogManifestSchema,
  CpuPerfFileSchema,
} from '@server-planner/model';
import { z } from 'zod';
import { CURATED_DIR } from './curated';

export const DIST_DIR = resolve(CURATED_DIR, '..', 'dist');
/** Files of the dist folder that the app reads (manifest last — it describes the others). */
export const DIST_FILES = ['apps.json', 'perf.json', 'CHANGELOG.json', 'manifest.json'] as const;

/**
 * Reads `catalog/dist` (written by the weekly workflow): checks every file against the SHA-256 in
 * the manifest and the schemas. No dist yet → null (the curated layer alone is the catalog).
 */
export async function loadDist(dir = DIST_DIR): Promise<CatalogDist | null> {
  let manifestText: string;
  try {
    manifestText = await readFile(join(dir, 'manifest.json'), 'utf8');
  } catch {
    return null;
  }
  const manifest = CatalogManifestSchema.parse(JSON.parse(manifestText));
  const read = async (name: string) => {
    const entry = manifest.files.find((f) => f.name === name);
    if (!entry) return undefined;
    const text = await readFile(join(dir, name), 'utf8');
    const hash = createHash('sha256').update(text).digest('hex');
    if (hash !== entry.sha256)
      throw new Error(`catalog/dist/${name}: SHA-256 does not match the manifest`);
    return JSON.parse(text) as unknown;
  };
  const apps = z.array(CatalogAppSchema).parse((await read('apps.json')) ?? []);
  const perfRaw = await read('perf.json');
  return { manifest, apps, ...(perfRaw ? { perf: CpuPerfFileSchema.parse(perfRaw) } : {}) };
}
