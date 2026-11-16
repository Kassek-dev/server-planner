import { APP_VERSION } from '../persistence/backup';

/** The public repository (About, catalog corrections). */
export const REPO = 'https://github.com/Kassek-dev/server-planner';

/** Longest issue body we put in a URL (browsers and GitHub accept far more; keep it readable). */
const MAX_BODY = 3000;

/**
 * CAT-06 "Suggest a correction": a prefilled GitHub issue for a catalog entry — what it is, the
 * catalog version and the values the app shows. Only a link: the app sends nothing itself.
 */
export function catalogCorrectionUrl(entry: {
  kind: 'device' | 'app' | 'cpu';
  id: string;
  name: string;
  catalogVersion: string;
  facts: Record<string, string | number | undefined>;
}): string {
  const facts = Object.entries(entry.facts)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `| ${k} | ${String(v).replace(/[|\n\r]/g, ' ')} |`);
  const body = [
    `**Catalog entry:** \`${entry.kind}/${entry.id}\` — ${entry.name}`,
    `**Catalog version:** ${entry.catalogVersion} · **App version:** ${APP_VERSION}`,
    '',
    '### Current values',
    '| Field | Value |',
    '| --- | --- |',
    ...facts,
    '',
    '### What is wrong',
    '',
    '### Correct value',
    '',
    '### Source (manufacturer page, documentation…)',
    '',
  ]
    .join('\n')
    .slice(0, MAX_BODY);
  const params = new URLSearchParams({
    title: `Catalog: ${entry.name} (${entry.kind}/${entry.id})`,
    labels: 'catalog',
    body,
  });
  return `${REPO}/issues/new?${params.toString()}`;
}
