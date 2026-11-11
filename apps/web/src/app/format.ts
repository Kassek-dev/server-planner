/** Locale-aware formatting via Intl — never hand-built strings (docs/01 § 7 rule 4). */

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/** "2 hours ago", "yesterday", "just now". */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return relative.format(0, 'minute');
}

export const formatKb = (bytes: number) =>
  new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(
    Math.max(1, Math.round(bytes / 1024)),
  );

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const UNIT_BYTES: Record<string, number> = {
  b: 1,
  kb: 1e3,
  mb: 1e6,
  gb: 1e9,
  tb: 1e12,
  kib: 1024,
  mib: MIB,
  gib: GIB,
  tib: 1024 ** 4,
};

/** "16 GiB", "1 TB", "512 MiB" → bytes; plain numbers are GiB (the usual unit in forms). */
export function parseSize(input: string): number | undefined {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*([kmgt]i?b|b)?\s*$/i.exec(input);
  if (!match) return undefined;
  const value = Number((match[1] ?? '').replace(',', '.'));
  const unit = (match[2] ?? 'gib').toLowerCase();
  const factor = UNIT_BYTES[unit];
  return factor === undefined ? undefined : Math.round(value * factor);
}

/** Bytes → "16 GiB" / "512 MiB" / "1 TB" (binary for < 1 TB-ish RAM sizes, decimal for disks). */
export function formatSize(bytes: number, decimal = false): string {
  const fmt = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
  if (decimal) {
    if (bytes >= 1e12) return `${fmt.format(bytes / 1e12)} TB`;
    return `${fmt.format(bytes / 1e9)} GB`;
  }
  if (bytes >= GIB) return `${fmt.format(bytes / GIB)} GiB`;
  return `${fmt.format(bytes / MIB)} MiB`;
}
