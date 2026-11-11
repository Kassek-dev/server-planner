import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildHomeLab } from '../test/support/home-lab';
import { homeLabFile } from '../test/support/project-file';

/** Regenerates fixtures/schema/v1/*.json from the builders (run after intentional model changes). */
const dir = join(import.meta.dirname, '../../../fixtures/schema/v1');
await mkdir(dir, { recursive: true });
await writeFile(
  join(dir, 'home-lab.json'),
  `${JSON.stringify(homeLabFile(buildHomeLab()), null, 2)}\n`,
);
console.log(`fixtures written to ${dir}`);
