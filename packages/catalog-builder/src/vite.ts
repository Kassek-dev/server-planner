import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CURATED_DIR, CURATED_KINDS, listCuratedFiles, loadCurated } from './curated';
import { DIST_DIR, DIST_FILES, loadDist } from './dist';

const ID = 'virtual:catalog';
const RESOLVED = `\0${ID}`;

interface PluginContext {
  addWatchFile(file: string): void;
  emitFile(file: { type: 'asset'; fileName: string; source: string }): string;
}

/**
 * Vite plugin (docs/03 § 7.3): `import('virtual:catalog')` yields `{ curated, dist }` — the
 * validated curated layer and the builder output — as a lazy chunk (CAT-01). The dist files are
 * also published next to the app under `catalog/` for in-app updates (CAT-04). Invalid data fails
 * the build with the same messages as `pnpm catalog:validate`.
 */
export function catalogPlugin(dir = CURATED_DIR, distDir = DIST_DIR) {
  return {
    name: 'server-planner-catalog',
    resolveId(id: string) {
      return id === ID ? RESOLVED : undefined;
    },
    async load(this: PluginContext, id: string) {
      if (id !== RESOLVED) return undefined;
      const files = await listCuratedFiles(dir);
      for (const kind of CURATED_KINDS)
        for (const name of files[kind]) this.addWatchFile(join(dir, kind, name));
      const { catalog, errors } = await loadCurated(dir);
      if (errors.length > 0)
        throw new Error(
          `Curated catalog is invalid:\n${errors.map((e) => `  ${e.file}: ${e.message}`).join('\n')}`,
        );
      const dist = await loadDist(distDir);
      return `export const curated = ${JSON.stringify(catalog)};\nexport const dist = ${JSON.stringify(dist)};`;
    },
    async generateBundle(this: PluginContext) {
      for (const name of DIST_FILES) {
        try {
          const source = await readFile(join(distDir, name), 'utf8');
          this.emitFile({ type: 'asset', fileName: `catalog/${name}`, source });
        } catch {
          // No dist yet — the app runs on the curated layer alone.
        }
      }
    },
  };
}
