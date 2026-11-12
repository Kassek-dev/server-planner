import { join } from 'node:path';
import { parse } from 'yaml';
import { extractTarText } from './archive';
import { type AppRecord, appKey, type SourceAdapter } from './types';

/** awesome-selfhosted-data (CC BY-SA 3.0) — names, descriptions, links, licenses, tags; docs/06 § 2.1. */

interface Entry {
  name?: string;
  description?: string;
  website_url?: string;
  source_code_url?: string;
  licenses?: string[];
  platforms?: string[];
  tags?: string[];
  stargazers_count?: number;
  archived?: boolean;
}

const https = (url: string | undefined) => (url?.startsWith('https://') ? url : undefined);

export const awesomeSelfhostedSource: SourceAdapter = {
  id: 'awesome-selfhosted',
  name: 'awesome-selfhosted-data',
  url: 'https://github.com/awesome-selfhosted/awesome-selfhosted-data',
  license: 'CC BY-SA 3.0',
  priority: 1,
  async fetch(ctx) {
    const archive = await ctx.download(
      'https://codeload.github.com/awesome-selfhosted/awesome-selfhosted-data/tar.gz/refs/heads/master',
      'awesome-selfhosted.tgz',
    );
    return extractTarText(
      archive,
      join(ctx.workDir, 'awesome-selfhosted'),
      '*/software/*.yml',
      (p) => /\/software\/[^/]+\.yml$/.test(p),
    );
  },
  normalize(raw) {
    const files = raw as { path: string; text: string }[];
    if (!Array.isArray(files) || files.length === 0)
      throw new Error('awesome-selfhosted: no software files');
    const out: AppRecord[] = [];
    for (const file of files) {
      let entry: Entry;
      try {
        entry = parse(file.text) as Entry;
      } catch {
        continue;
      }
      if (!entry?.name || entry.archived) continue;
      if (!(entry.platforms ?? []).some((p) => p.toLowerCase() === 'docker')) continue;
      const website = https(entry.website_url);
      const repository = https(entry.source_code_url);
      out.push({
        kind: 'app',
        source: 'awesome-selfhosted',
        key: appKey(entry.name),
        ...(repository ? { aliases: [appKey(repository)] } : {}),
        name: entry.name,
        ...(entry.description ? { description: entry.description.trim() } : {}),
        ...(website ? { website } : {}),
        ...(repository ? { repository } : {}),
        ...(entry.licenses?.length ? { license: entry.licenses.join(' / ') } : {}),
        categories: (entry.tags ?? []).map((t) => t.split(' - ')[0]?.trim() ?? t),
        ...(entry.stargazers_count ? { popularity: entry.stargazers_count } : {}),
      });
    }
    return out;
  },
};
