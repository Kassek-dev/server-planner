import { CURATED_KINDS, listCuratedFiles } from './curated';

// Schema validation of curated YAML arrives with MVP stage 7 (docs/03 § 11).
// Until then, fail loudly if curated data appears without a validator.
const files = await listCuratedFiles();
const total = CURATED_KINDS.reduce((sum, kind) => sum + files[kind].length, 0);

if (total > 0) {
  console.error(
    `catalog:validate — found ${total} curated file(s) but validators are not implemented yet.`,
  );
  process.exit(1);
}
console.log('catalog:validate — no curated files yet, nothing to validate.');
