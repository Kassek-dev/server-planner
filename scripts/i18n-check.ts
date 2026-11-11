/**
 * i18n check — docs/01 § 7 rule 8.
 * - every literal key passed to t() exists in the file's namespace,
 * - every key in locales/en is used somewhere (literal, or covered by a dynamic `prefix.${x}` key),
 * - every language has the same keys and ICU arguments as `en`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { ISSUE_CODES } from '../packages/engine/src/validation/rules';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'apps/web/src');
const LOCALES = join(SRC, 'i18n/locales');
const BASE_LANG = 'en';

type Dict = Map<string, string>; // "ns:key" -> message

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : Promise.resolve([join(dir, e.name)]),
    ),
  );
  return files.flat();
}

function flatten(obj: unknown, prefix: string, out: Dict) {
  if (typeof obj === 'string') {
    out.set(prefix, obj);
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj))
      flatten(v, prefix.endsWith(':') ? `${prefix}${k}` : `${prefix}.${k}`, out);
  }
}

async function loadLang(lang: string): Promise<Dict> {
  const dict: Dict = new Map();
  for (const file of await readdir(join(LOCALES, lang))) {
    if (!file.endsWith('.json')) continue;
    const ns = file.replace(/\.json$/, '');
    flatten(JSON.parse(await readFile(join(LOCALES, lang, file), 'utf8')), `${ns}:`, dict);
  }
  return dict;
}

const icuArgs = (msg: string) =>
  new Set([...msg.matchAll(/\{\s*([A-Za-z_]\w*)/g)].map((m) => m[1]));

const errors: string[] = [];
const langs = (await readdir(LOCALES, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
const base = await loadLang(BASE_LANG);

// 1. literal keys used in code exist; collect usage
const used = new Set<string>();
const dynamicPrefixes = new Set<string>();
const literals = new Set<string>();
const sourceFiles = (await walk(SRC)).filter(
  (f) => /\.(ts|tsx)$/.test(f) && !f.includes('/i18n/locales/'),
);

for (const file of sourceFiles) {
  const code = await readFile(file, 'utf8');
  for (const m of code.matchAll(/['"]([A-Za-z0-9_.:-]+)['"]/g)) if (m[1]) literals.add(m[1]);
  const ns = /useTranslation\(\s*['"](\w+)['"]/.exec(code)?.[1] ?? 'common';
  for (const m of code.matchAll(/\bt\(\s*(['"`])([^'"`]+)\1/g)) {
    const raw = m[2] ?? '';
    const full = raw.includes(':') ? raw : `${ns}:${raw}`;
    if (raw.includes('${')) {
      dynamicPrefixes.add(full.slice(0, full.indexOf('${')));
      continue;
    }
    used.add(full);
    if (!base.has(full)) errors.push(`missing key "${full}" used in ${relative(ROOT, file)}`);
  }
}

// 2. unused keys
for (const key of base.keys()) {
  const [ns, path] = key.split(':') as [string, string];
  const isUsed =
    used.has(key) ||
    literals.has(path) ||
    literals.has(key) ||
    [...dynamicPrefixes].some((p) => key.startsWith(p)) ||
    ns === 'issues'; // issue keys are referenced by engine codes, checked separately
  if (!isUsed) errors.push(`unused key "${key}"`);
}

// 3. every engine issue code has a title and a description (docs/03 § 5.2)
for (const code of ISSUE_CODES) {
  for (const part of ['title', 'description']) {
    if (!base.has(`issues:${code}.${part}`))
      errors.push(`engine issue ${code} has no "issues:${code}.${part}"`);
  }
}

// 4. other languages match en
for (const lang of langs.filter((l) => l !== BASE_LANG)) {
  const dict = await loadLang(lang);
  for (const [key, msg] of base) {
    const other = dict.get(key);
    if (other === undefined) errors.push(`[${lang}] missing key "${key}"`);
    else if ([...icuArgs(msg)].sort().join() !== [...icuArgs(other)].sort().join())
      errors.push(`[${lang}] ICU arguments differ for "${key}"`);
  }
  for (const key of dict.keys()) if (!base.has(key)) errors.push(`[${lang}] extra key "${key}"`);
}

if (errors.length) {
  console.error(`i18n:check — ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`i18n:check — OK (${base.size} keys, languages: ${langs.join(', ')})`);
