import type { DeviceKind } from './schema/device';
import type { Project } from './schema/project';

/**
 * LBL-05 naming conventions: a pattern per device kind with tokens {site}, {kind} (a short code),
 * {nn} (two-digit number) and {n} (plain number) — `{site}-{kind}-{nn}` → `home-sw-01` — and
 * RFC 1123 host names (lower-case letters, digits and hyphens, at most 63, no hyphen at the ends).
 */

export const KIND_CODES: Record<DeviceKind, string> = {
  internet: 'inet',
  modem: 'modem',
  router: 'gw',
  firewall: 'fw',
  switch: 'sw',
  'access-point': 'ap',
  server: 'srv',
  'mini-pc': 'pc',
  sbc: 'sbc',
  nas: 'nas',
  ups: 'ups',
  'patch-panel': 'pp',
  client: 'cl',
};

export const NAMING_TOKENS = ['{site}', '{kind}', '{nn}', '{n}'] as const;

/** The name a pattern gives for number `n`. */
export function nameFromPattern(
  pattern: string,
  kind: DeviceKind,
  site: string,
  n: number,
): string {
  return pattern
    .replaceAll('{site}', site)
    .replaceAll('{kind}', KIND_CODES[kind])
    .replaceAll('{nn}', String(n).padStart(2, '0'))
    .replaceAll('{n}', String(n));
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether a name follows the pattern (numbers may grow past two digits). */
export function matchesPattern(name: string, pattern: string, kind: DeviceKind, site: string) {
  const parts = pattern.split(/(\{site\}|\{kind\}|\{nn\}|\{n\})/);
  const source = parts
    .map((p) =>
      p === '{site}'
        ? escapeRegex(site)
        : p === '{kind}'
          ? escapeRegex(KIND_CODES[kind])
          : p === '{nn}'
            ? '\\d{2,}'
            : p === '{n}'
              ? '\\d+'
              : escapeRegex(p),
    )
    .join('');
  return new RegExp(`^${source}$`).test(name);
}

/** The pattern of a kind in the project, if the project has naming conventions for it. */
export function namingPattern(project: Pick<Project, 'settings'>, kind: DeviceKind) {
  const naming = project.settings.naming;
  const pattern = naming?.patterns[kind];
  return pattern ? { pattern, site: naming?.site ?? '' } : undefined;
}

/** The first name the pattern gives that no device has yet. */
export function nextPatternName(
  project: Pick<Project, 'devices' | 'settings'>,
  kind: DeviceKind,
  except?: string,
): string | undefined {
  const rule = namingPattern(project, kind);
  if (!rule) return undefined;
  const taken = new Set(
    Object.values(project.devices)
      .filter((d) => d.id !== except)
      .map((d) => d.name),
  );
  for (let n = 1; n < 1000; n += 1) {
    const name = nameFromPattern(rule.pattern, kind, rule.site, n);
    if (!taken.has(name)) return name;
  }
  return undefined;
}

/** RFC 1123 host name label. */
export const isHostname = (name: string) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(name);

/** A host name made from any name: lower case, other characters → hyphens. */
export const toHostname = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || 'host';
