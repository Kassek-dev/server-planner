import { join } from 'node:path';
import { CURATED_DIR, CURATED_KINDS, listCuratedFiles, loadCurated } from './curated';

const ID = 'virtual:catalog';
const RESOLVED = `\0${ID}`;

interface PluginContext {
  addWatchFile(file: string): void;
}

/**
 * Vite plugin: `import('virtual:catalog')` yields the validated curated catalog as a separate,
 * lazily loaded chunk — the base layer that works offline from the first run (CAT-01, docs/03 § 7.3).
 * Invalid curated data fails the build with the same messages as `pnpm catalog:validate`.
 */
export function catalogPlugin(dir = CURATED_DIR) {
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
      return `export default ${JSON.stringify(catalog)};`;
    },
  };
}
