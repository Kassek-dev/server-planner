import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildHomeLab } from '../test/support/home-lab';
import { homeLabFile } from '../test/support/project-file';
import { buildReverseProxyLab } from '../test/support/reverse-proxy';

/**
 * Regenerates fixtures/schema/v3/*.json from the builders (run after intentional model changes).
 * Fixtures of older versions (v1/, v2/) are frozen: they test the migrations.
 */
const dir = join(import.meta.dirname, '../../../fixtures/schema/v3');
await mkdir(dir, { recursive: true });
for (const [name, project] of [
  ['home-lab', buildHomeLab()],
  ['reverse-proxy', buildReverseProxyLab()],
] as const) {
  await writeFile(join(dir, `${name}.json`), `${JSON.stringify(homeLabFile(project), null, 2)}\n`);
}
console.log(`fixtures written to ${dir}`);
