import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const ID = 'virtual:licenses';
const RESOLVED = `\0${ID}`;

export interface DependencyLicense {
  name: string;
  version: string;
  license: string;
  url?: string;
}

interface PackageJson {
  name: string;
  version: string;
  license?: string | { type: string };
  homepage?: string;
  repository?: string | { url?: string };
  dependencies?: Record<string, string>;
}

/** Locates a dependency's package.json from the package that depends on it. */
function resolvePackage(fromDir: string, name: string): string | undefined {
  const require = createRequire(join(fromDir, 'package.json'));
  try {
    return require.resolve(`${name}/package.json`);
  } catch {
    // Packages without an exported package.json: walk up from the main entry.
    try {
      let dir = dirname(require.resolve(name));
      for (let i = 0; i < 8; i += 1) {
        try {
          const file = join(dir, 'package.json');
          const pkg = JSON.parse(readFileSync(file, 'utf8')) as PackageJson;
          if (pkg.name === name) return file;
        } catch {
          // keep walking up
        }
        dir = dirname(dir);
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const urlOf = (pkg: PackageJson) => {
  const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const url = (raw ?? pkg.homepage ?? '')
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '');
  return url.startsWith('https://') ? url : undefined;
};

/** Production dependencies (transitive) of the web app with their licenses (P-03c). */
export function collectLicenses(appDir: string): DependencyLicense[] {
  const root = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as PackageJson;
  const seen = new Map<string, DependencyLicense>();
  const queue: { from: string; name: string }[] = Object.entries(root.dependencies ?? {})
    .filter(([, spec]) => !spec.startsWith('workspace:'))
    .map(([name]) => ({ from: appDir, name }));
  while (queue.length > 0) {
    const { from, name } = queue.shift() as { from: string; name: string };
    const file = resolvePackage(from, name);
    if (!file) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as PackageJson;
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) continue;
    const license =
      typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? 'UNKNOWN');
    const url = urlOf(pkg);
    seen.set(key, { name: pkg.name, version: pkg.version, license, ...(url ? { url } : {}) });
    for (const dep of Object.keys(pkg.dependencies ?? {}))
      queue.push({ from: dirname(file), name: dep });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Vite plugin: `import('virtual:licenses')` → the list above, computed at build time. */
export function licensesPlugin(appDir: string) {
  return {
    name: 'server-planner-licenses',
    resolveId: (id: string) => (id === ID ? RESOLVED : undefined),
    load: (id: string) =>
      id === RESOLVED ? `export default ${JSON.stringify(collectLicenses(appDir))};` : undefined,
  };
}
