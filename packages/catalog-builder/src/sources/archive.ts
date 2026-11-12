import { execFile } from 'node:child_process';
import { lstat, mkdir, readdir, readFile, realpath } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Largest member we read; source files are a few KB, anything bigger is suspicious. */
export const MAX_MEMBER_BYTES = 1024 * 1024;

/**
 * Extracts matching members of a .tar.gz with the system `tar` and returns their text.
 * The archive comes from the internet, so only regular files that resolve inside `into` and are
 * small are read — a symlink to a file outside never leaks it into the catalog.
 */
export async function extractTarText(
  archive: string,
  into: string,
  pattern: string,
  match: (path: string) => boolean,
): Promise<{ path: string; text: string }[]> {
  await mkdir(into, { recursive: true });
  await run(
    'tar',
    [
      'xzf',
      archive,
      '-C',
      into,
      '--no-same-owner',
      '--no-same-permissions',
      '--wildcards',
      pattern,
    ],
    {
      maxBuffer: 1 << 26,
    },
  );
  const root = await realpath(into);
  const out: { path: string; text: string }[] = [];
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue; // symlinks, devices, FIFOs
      const info = await lstat(full);
      if (!info.isFile() || info.size > MAX_MEMBER_BYTES) continue;
      const real = await realpath(full);
      if (real !== root && !real.startsWith(root + sep)) continue;
      const path = relative(into, full);
      if (match(path)) out.push({ path, text: await readFile(full, 'utf8') });
    }
  };
  await walk(into);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
