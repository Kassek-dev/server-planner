/**
 * Design token check — docs/04 § 2, § 8.
 * - WCAG contrast of token pairs in both themes (text ≥ 4.5:1, graphics ≥ 3:1),
 * - no raw hex colors or default Tailwind palette classes in apps/web/src (tokens only).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'apps/web/src');
const TOKENS = join(SRC, 'styles/tokens.css');

type Theme = Record<string, string>;

function parseBlock(css: string, selector: RegExp): Theme {
  const block = selector.exec(css)?.[1] ?? '';
  const out: Theme = {};
  for (const m of block.matchAll(/--sp-([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g))
    out[m[1] as string] = m[2] as string;
  return out;
}

function luminance(hex: string): number {
  const h = hex.length === 4 ? hex.replace(/\w/g, (c) => c + c).slice(1) : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
};

const surfaces = ['bg-app', 'bg-panel', 'bg-tile', 'bg-tile-header', 'bg-raised'];
const textPairs: [string, string][] = [
  ...['text-primary', 'text-secondary', 'text-muted'].flatMap((t) =>
    surfaces.map((s) => [t, s] as [string, string]),
  ),
  ['accent-text', 'bg-panel'],
  ['accent-text', 'bg-tile'],
  ['on-accent', 'accent'],
  ['status-off-text', 'bg-panel'],
  ...['ok', 'warning', 'error', 'info'].map(
    (s) => [`status-${s}-text`, 'bg-panel'] as [string, string],
  ),
  ...['warning', 'error', 'info'].map(
    (s) => [`status-${s}-text`, `status-${s}-bg`] as [string, string],
  ),
];
const graphicPairs: [string, string][] = [
  ['border-strong', 'bg-canvas'],
  ['port-trunk', 'bg-canvas'],
  ['port-wan', 'bg-canvas'],
  ['selection', 'bg-tile'],
  ['focus-ring', 'bg-panel'],
  ...['violet', 'sky', 'teal', 'pink', 'indigo', 'sand', 'lime', 'cyan'].map(
    (v) => [`vlan-${v}`, 'bg-canvas'] as [string, string],
  ),
  ...['ok', 'warning', 'error', 'info'].map((s) => [`status-${s}`, 'bg-tile'] as [string, string]),
];

const css = await readFile(TOKENS, 'utf8');
const dark = parseBlock(css, /:root,\s*\[data-theme=['"]dark['"]\]\s*\{([^}]*)\}/);
const light = { ...dark, ...parseBlock(css, /\[data-theme=['"]light['"]\]\s*\{([^}]*)\}/) };
const errors: string[] = [];

for (const [name, theme] of [
  ['dark', dark],
  ['light', light],
] as const) {
  for (const [pairs, min] of [
    [textPairs, 4.5],
    [graphicPairs, 3],
  ] as const) {
    for (const [fg, bg] of pairs) {
      const a = theme[fg];
      const b = theme[bg];
      if (!a || !b) {
        errors.push(`[${name}] unknown token ${!a ? fg : bg}`);
        continue;
      }
      const ratio = contrast(a, b);
      if (ratio < min)
        errors.push(
          `[${name}] ${fg} (${a}) on ${bg} (${b}) = ${ratio.toFixed(2)}:1, needs ${min}:1`,
        );
    }
  }
}

// raw colors / palette classes in source
const palette =
  /\b(?:bg|text|border|ring|fill|stroke|outline|decoration|from|via|to|shadow|divide|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?\b/;
async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])),
    )
  ).flat();
}
for (const file of await walk(SRC)) {
  if (!/\.(tsx?|css)$/.test(file) || file === TOKENS || file.endsWith('.test.tsx')) continue;
  const lines = (await readFile(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    const where = `${relative(ROOT, file)}:${i + 1}`;
    if (/#[0-9a-fA-F]{3,8}\b/.test(line) && !line.includes('tokens-check-ignore'))
      errors.push(`raw hex color in ${where}`);
    const m = palette.exec(line);
    if (m) errors.push(`raw palette class "${m[0]}" in ${where}`);
  });
}

if (errors.length) {
  console.error(`tokens:check — ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `tokens:check — OK (${textPairs.length + graphicPairs.length} pairs × 2 themes, no raw colors)`,
);
