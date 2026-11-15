/**
 * i18n check — docs/01 § 7 rule 8.
 * - every literal key passed to t() exists in the file's namespace,
 * - every key in locales/en is used somewhere (literal, or covered by a dynamic `prefix.${x}` key),
 * - every language has the same keys and ICU arguments as `en`,
 * - no JSON object repeats a key (JSON.parse would silently keep the last one).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { SIM_CODES } from '../packages/engine/src/simulation/reach';
import { ISSUE_CODES } from '../packages/engine/src/validation/rules';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'apps/web/src');
const LOCALES = join(SRC, 'i18n/locales');
const BASE_LANG = 'en';

type Dict = Map<string, string>; // "ns:key" -> message

const errors: string[] = [];

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

/** Keys repeated inside one JSON object, as dotted paths (a small scanner over the raw text). */
export function duplicateKeys(text: string): string[] {
  const out: string[] = [];
  // One frame per open object ({ keys, path }) or array (null).
  const stack: ({ keys: Set<string>; path: string } | null)[] = [];
  let lastKey: string | undefined;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      const value = JSON.parse(text.slice(i, j + 1)) as string;
      i = j + 1;
      while (/\s/.test(text[i] ?? '')) i += 1;
      const frame = stack.at(-1);
      if (text[i] === ':' && frame) {
        const path = frame.path ? `${frame.path}.${value}` : value;
        if (frame.keys.has(value)) out.push(path);
        frame.keys.add(value);
        lastKey = path;
      }
      continue;
    }
    if (c === '{') {
      const parent = stack.at(-1);
      stack.push({ keys: new Set(), path: parent === null ? '' : (lastKey ?? '') });
    } else if (c === '[') stack.push(null);
    else if (c === '}' || c === ']') stack.pop();
    i += 1;
  }
  return out;
}

async function loadLang(lang: string): Promise<Dict> {
  const dict: Dict = new Map();
  for (const file of await readdir(join(LOCALES, lang))) {
    if (!file.endsWith('.json')) continue;
    const ns = file.replace(/\.json$/, '');
    const text = await readFile(join(LOCALES, lang, file), 'utf8');
    for (const key of duplicateKeys(text)) errors.push(`[${lang}] duplicate key "${ns}:${key}"`);
    flatten(JSON.parse(text), `${ns}:`, dict);
  }
  return dict;
}

const icuArgs = (msg: string) =>
  new Set([...msg.matchAll(/\{\s*([A-Za-z_]\w*)/g)].map((m) => m[1]));

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

// 3b. every simulation step code has a sentence (docs/03 § 5.3)
for (const code of SIM_CODES) {
  if (!base.has(`simulation:steps.${code}`))
    errors.push(`simulation step ${code} has no "simulation:steps.${code}"`);
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
