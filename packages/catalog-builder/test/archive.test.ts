import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { extractTarText, MAX_MEMBER_BYTES } from '../src/sources/archive';

const run = promisify(execFile);

describe('extractTarText', () => {
  it('reads regular files only: no symlinks or oversized members', async () => {
    const base = await mkdtemp(join(tmpdir(), 'tar-'));
    const repo = join(base, 'repo', 'ct');
    await mkdir(repo, { recursive: true });
    const secret = join(base, 'secret.txt');
    await writeFile(secret, 'TOP SECRET');
    await writeFile(join(repo, 'good.sh'), 'APP="Good"');
    await symlink(secret, join(repo, 'evil.sh'));
    await writeFile(join(repo, 'huge.sh'), 'x'.repeat(MAX_MEMBER_BYTES + 1));
    const archive = join(base, 'a.tgz');
    await run('tar', ['czf', archive, '-C', base, 'repo']);

    const files = await extractTarText(archive, join(base, 'out'), '*/ct/*.sh', (p) =>
      p.endsWith('.sh'),
    );
    expect(files.map((f) => f.path)).toEqual(['repo/ct/good.sh']);
    expect(files.some((f) => f.text.includes('SECRET'))).toBe(false);
  });
});
