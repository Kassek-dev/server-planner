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
