import { OS_IDS } from '@server-planner/model';
import { loadCurated } from './curated';

/** `pnpm catalog:validate` — curated YAML against the catalog schemas (docs/03 § 7, CI). */
const { catalog, errors } = await loadCurated();

const coveredOs = new Set(catalog.os.map((o) => o.id));
for (const id of OS_IDS) {
  if (!coveredOs.has(id)) errors.push({ file: 'os/', message: `missing OS entry for "${id}"` });
}

if (errors.length > 0) {
  console.error(`catalog:validate — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  ${e.file}: ${e.message}`);
  process.exit(1);
}
console.log(
  `catalog:validate — OK (${catalog.apps.length} apps, ${catalog.devices.length} devices, ${catalog.cpus.length} CPUs, ${catalog.os.length} OS)`,
);
