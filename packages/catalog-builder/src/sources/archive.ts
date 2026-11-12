import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Extracts matching members of a .tar.gz with the system `tar` and returns their text. */
export async function extractTarText(
  archive: string,
  into: string,
  pattern: string,
  match: (path: string) => boolean,
): Promise<{ path: string; text: string }[]> {
  await mkdir(into, { recursive: true });
  await run('tar', ['xzf', archive, '-C', into, '--wildcards', pattern], { maxBuffer: 1 << 26 });
  const out: { path: string; text: string }[] = [];
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const path = relative(into, full);
        if (match(path)) out.push({ path, text: await readFile(full, 'utf8') });
      }
    }
  };
  await walk(into);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
