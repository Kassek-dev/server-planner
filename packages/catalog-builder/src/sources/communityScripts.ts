import { join } from 'node:path';
import { extractTarText } from './archive';
import { type AppRecord, appKey, type SourceAdapter } from './types';

/** Proxmox VE Community Scripts (MIT) — LXC resources per app from `ct/*.sh`; docs/06 § 2.2. */

const variable = (text: string, name: string) =>
  new RegExp(`${name}="\\$\\{${name}:-([^}"]*)\\}"`).exec(text)?.[1] ??
  new RegExp(`^${name}="?([^"\\n]*)"?$`, 'm').exec(text)?.[1];

export function parseScript(path: string, text: string): AppRecord | undefined {
  const app = /^APP="([^"]+)"/m.exec(text)?.[1];
  const cpu = Number(variable(text, 'var_cpu'));
  const ram = Number(variable(text, 'var_ram'));
  const disk = Number(variable(text, 'var_disk'));
  if (!app || !(cpu > 0) || !(ram > 0)) return undefined;
  const file = path.replace(/^.*\//, '').replace(/\.sh$/, '');
  const tags = (variable(text, 'var_tags') ?? '')
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    kind: 'app',
    source: 'community-scripts',
    key: appKey(app),
    aliases: [appKey(file)],
    name: app,
    categories: tags,
    lxc: { cpu, ramMb: ram, diskGb: disk > 0 ? disk : 4 },
  };
}

export const communityScriptsSource: SourceAdapter = {
  id: 'community-scripts',
  name: 'Proxmox VE Community Scripts',
  url: 'https://github.com/community-scripts/ProxmoxVE',
  license: 'MIT',
  priority: 3,
  async fetch(ctx) {
    const archive = await ctx.download(
      'https://codeload.github.com/community-scripts/ProxmoxVE/tar.gz/refs/heads/main',
      'community-scripts.tgz',
    );
    return extractTarText(archive, join(ctx.workDir, 'community-scripts'), '*/ct/*.sh', (p) =>
      /\/ct\/[^/]+\.sh$/.test(p),
    );
  },
  normalize(raw) {
    const files = raw as { path: string; text: string }[];
    if (!Array.isArray(files) || files.length === 0)
      throw new Error('community-scripts: no ct scripts');
    return files.map((f) => parseScript(f.path, f.text)).filter((r): r is AppRecord => !!r);
  },
};
