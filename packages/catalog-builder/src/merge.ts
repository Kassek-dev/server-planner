import {
  type CatalogApp,
  CatalogAppSchema,
  type Listener,
  type PortMapping,
  type Resources,
  type TrafficPattern,
} from '@server-planner/model';
import { SCENES } from './sources/blender';
import { type AppRecord, appKey, type CpuPerfRecord } from './sources/types';

/**
 * Merging (docs/03 § 7.1 step 3–4): source records → imported catalog apps. Curated apps always
 * win; a deployable app needs a container image (LinuxServer.io), the other sources enrich it.
 */

export interface Heuristics {
  excludeImages?: string[];
  lxcToDocker: { memoryFactor: number; cpuFactor: number; osDiskGb: number; minDiskGb: number };
  defaultRequirements: { min: Resources; recommended: Resources };
  cpuReference: string;
}

/** Our category slugs (docs/02 § 9.2) from the words sources use. */
const CATEGORY_RULES: [RegExp, string][] = [
  [/browser|remote desktop|editor|3d (model|print)|desktop/i, 'desktop'],
  [/\bai\b|machine learning|science|llm/i, 'ai'],
  [/media|stream|music|audio|video|podcast|book|comic|manga/i, 'media'],
  [/photo|gallery|image/i, 'photos'],
  [/download|torrent|usenet|bittorrent|indexer/i, 'downloads'],
  [/home ?automation|iot|smart home/i, 'home-automation'],
  [/dns|ad.?block/i, 'dns'],
  [/proxy|reverse/i, 'reverse-proxy'],
  [/vpn|wireguard|tunnel/i, 'vpn'],
  [/network|ssh|remote access/i, 'networking'],
  [/monitor|metric|status|log/i, 'monitoring'],
  [/backup|sync/i, 'backup'],
  [/file|storage|nas|cloud|ftp/i, 'files'],
  [/password|auth|identity|secret|security/i, 'security'],
  [/database/i, 'database'],
  [/dashboard|start ?page/i, 'dashboard'],
  [/develop|programming|git|code|ci\b|ide\b/i, 'development'],
  [/document|note|wiki|knowledge|pdf|content management/i, 'documents'],
  [/finance|money|budget|accounting/i, 'finance'],
  [/automation|workflow/i, 'automation'],
  [/game/i, 'games'],
  [/rss|news|read|bookmark/i, 'news'],
  [/chat|communication|mail|messag|irc|social/i, 'messaging'],
  [/recipe|family|household/i, 'home'],
  [/productiv|calendar|task|project|office|business/i, 'productivity'],
  [/admin|manage|docker|container/i, 'management'],
];

export function categoriesFor(words: string[]): string[] {
  const out = new Set<string>();
  for (const word of words)
    for (const [rule, slug] of CATEGORY_RULES) if (rule.test(word)) out.add(slug);
  return out.size > 0 ? [...out].slice(0, 3) : ['other'];
}

const WEB = /web ?ui|webui|web interface|gui|http(?!s? ?api)|dashboard|interface/i;
const titleCase = (slug: string) =>
  slug
    .split(/[-_]/)
    .map((w) => (w ? w[0]?.toUpperCase() + w.slice(1) : w))
    .join(' ');

function volumePurpose(path: string): 'config' | 'data' | 'media' | 'cache' {
  if (/^\/config\b/.test(path)) return 'config';
  if (/media|movie|tv|music|photo|video|book|comic|audio|podcast/i.test(path)) return 'media';
  if (/cache|transcode|tmp/i.test(path)) return 'cache';
  return 'data';
}

/** Index of source records by key and alias (first wins → sorted by source priority). */
function index(records: AppRecord[]) {
  const map = new Map<string, AppRecord>();
  for (const r of records)
    for (const k of [r.key, ...(r.aliases ?? [])]) if (k && !map.has(k)) map.set(k, r);
  return map;
}

export interface MergeInput {
  records: AppRecord[];
  curated: CatalogApp[];
  aliases: Record<string, string[]>;
  heuristics: Heuristics;
}

export interface MergeResult {
  apps: CatalogApp[];
  /** Curated app id → sources that also describe it (attribution only). */
  curatedSources: Record<string, string[]>;
  rejected: { key: string; reason: string }[];
}

export function mergeApps({ records, curated, aliases, heuristics }: MergeInput): MergeResult {
  const bySource = (id: string) => index(records.filter((r) => r.source === id));
  const asd = bySource('awesome-selfhosted');
  const cs = bySource('community-scripts');
  const excluded = new Set(heuristics.excludeImages ?? []);
  const images = records.filter(
    (r) =>
      r.source === 'linuxserver' && r.image && !excluded.has(r.image.name.replace(/^.*\//, '')),
  );

  // Every key a curated app is known by.
  const curatedKey = new Map<string, string>();
  for (const app of curated) {
    for (const k of [appKey(app.id), appKey(app.name), ...(aliases[app.id] ?? [])])
      curatedKey.set(k, app.id);
    for (const c of app.deployment.components) curatedKey.set(appKey(c.image), app.id);
  }
  const curatedSources: Record<string, string[]> = {};
  const attribute = (id: string, source: string) => {
    curatedSources[id] = [...new Set([...(curatedSources[id] ?? []), source])];
  };
  for (const r of records) {
    const hit = [r.key, ...(r.aliases ?? [])].map((k) => curatedKey.get(k)).find(Boolean);
    if (hit) attribute(hit, r.source);
  }

  const apps: CatalogApp[] = [];
  const rejected: MergeResult['rejected'] = [];
  const usedIds = new Set(curated.map((a) => a.id));
  for (const image of images) {
    const keys = [image.key, ...(image.aliases ?? [])];
    if (keys.some((k) => curatedKey.has(k))) continue;
    const info = keys.map((k) => asd.get(k)).find(Boolean);
    const lxc = keys.map((k) => cs.get(k)).find(Boolean);
    const slug = (image.image?.name.replace(/^.*\//, '') ?? image.key)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (usedIds.has(slug)) continue;
    const app = buildApp(slug, image, info, lxc, heuristics);
    const parsed = CatalogAppSchema.safeParse(app);
    if (!parsed.success) {
      rejected.push({
        key: slug,
        reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
      continue;
    }
    usedIds.add(slug);
    apps.push(parsed.data);
  }
  apps.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.name.localeCompare(b.name));
  return { apps, curatedSources, rejected };
}

function buildApp(
  slug: string,
  image: AppRecord,
  info: AppRecord | undefined,
  lxc: AppRecord | undefined,
  h: Heuristics,
): unknown {
  const img = image.image as NonNullable<AppRecord['image']>;
  const name = info?.name ?? lxc?.name ?? titleCase(slug);
  const ports = img.ports.filter(
    (p, i, all) =>
      all.findIndex((q) => q.container === p.container && q.protocol === p.protocol) === i,
  );
  let web = ports.find((p) => p.protocol === 'tcp' && WEB.test(p.description));
  web ??= ports.find((p) => p.protocol === 'tcp' && !p.optional && lxc?.lxc?.port === p.container);
  web ??= ports.find((p) => p.protocol === 'tcp' && !p.optional);
  const listeners: Listener[] = ports.map((p) => ({
    port: p.container,
    protocol: p.protocol,
    purpose: p === web ? 'web-ui' : 'service',
  }));
  const mappings: PortMapping[] = ports
    .filter((p) => !p.optional)
    .map((p) => ({ hostPort: p.host, containerPort: p.container, protocol: p.protocol }));
  const volumes = img.volumes
    .filter((v, i, all) => all.findIndex((w) => w.path === v.path) === i)
    .map((v) => {
      const purpose = volumePurpose(v.path);
      return {
        name: (
          v.path
            .replace(/^\//, '')
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-|-$/g, '') || 'data'
        ).toLowerCase(),
        containerPath: v.path,
        purpose,
        ...(purpose === 'config' ? { defaultSizeBytes: 1e9 } : {}),
      };
    });
  const requirements = lxc?.lxc
    ? (() => {
        const { cpu, ramMb, diskGb } = lxc.lxc;
        const f = h.lxcToDocker;
        const rec: Resources = {
          cpu: Math.max(0.25, cpu * f.cpuFactor),
          memoryBytes: Math.round(ramMb * f.memoryFactor) * 1024 ** 2,
          diskBytes: Math.max(f.minDiskGb, diskGb - f.osDiskGb) * 1e9,
        };
        return {
          min: {
            cpu: Math.max(0.25, rec.cpu / 2),
            memoryBytes: Math.max(128 * 1024 ** 2, rec.memoryBytes / 2),
            diskBytes: Math.max(1e9, rec.diskBytes / 2),
          },
          recommended: rec,
        };
      })()
    : h.defaultRequirements;
  const patterns: TrafficPattern[] = [
    ...ports.map((p) => ({
      id: `${p === web ? 'web-ui' : 'service'}-${p.protocol}-${p.container}`,
      direction: 'inbound' as const,
      peer: { kind: 'lan-clients' as const },
      protocol: p.protocol,
      port: p.container,
      purpose: p === web ? 'web-ui' : 'service',
      required: !p.optional,
    })),
    {
      id: 'update-check',
      direction: 'outbound',
      peer: { kind: 'internet' },
      protocol: 'tcp',
      port: 443,
      purpose: 'update-check',
      required: false,
    },
  ];
  const sources = [
    'linuxserver',
    ...(info ? ['awesome-selfhosted'] : []),
    ...(lxc ? ['community-scripts'] : []),
  ];
  const words = [
    ...(image.categories ?? []),
    ...(info?.categories ?? []),
    ...(lxc?.categories ?? []),
  ];
  return {
    id: slug,
    name,
    description: { en: info?.description ?? `${name} — container image from LinuxServer.io.` },
    categories: categoriesFor(words),
    ...(info?.website ? { website: info.website } : {}),
    ...(info?.repository ? { repository: info.repository } : {}),
    ...(info?.license ? { license: info.license } : {}),
    ...((info?.popularity ?? image.popularity)
      ? { popularity: info?.popularity ?? image.popularity }
      : {}),
    source: sources,
    confidence: lxc ? 'imported' : 'estimated',
    deployment: {
      kind: 'single',
      components: [
        {
          key: 'server',
          name: slug,
          role: 'app',
          image: img.name,
          defaultTag: img.tag,
          arch: img.arch,
          platform: 'linux',
          listeners,
          defaultPortMappings: mappings,
          volumes,
        },
      ],
    },
    requirements,
    dependencies: [],
    provides: [],
    trafficPatterns: patterns,
    flows: web
      ? [
          {
            id: `${slug}.open-ui`,
            name: { en: `Open ${name}` },
            roles: [
              {
                key: 'client',
                name: { en: 'Browser' },
                selector: { kind: 'lan-clients' },
                userPicks: true,
              },
              { key: 'server', name: { en: name }, selector: { kind: 'self' }, userPicks: false },
            ],
            steps: [
              {
                from: 'client',
                to: 'server',
                protocol: 'tcp',
                purpose: 'web-ui',
                resolveDns: true,
              },
            ],
          },
        ]
      : [],
  };
}

export interface CpuPerf {
  name: string;
  normalized: string;
  /** 100 = reference CPU (heuristics.cpuReference). */
  score: number;
  samples: number;
}

/** Relative multi-core scores (docs/06 § 3.1): sum of scene medians vs the reference CPU. */
export function cpuScores(records: CpuPerfRecord[], reference: string): CpuPerf[] {
  const ref = records.find((r) => r.normalized === reference);
  if (!ref) throw new Error(`Reference CPU "${reference}" has no results`);
  return records
    .map((r) => {
      const common = SCENES.filter((s) => r.scenes[s] && ref.scenes[s]);
      if (common.length === 0) return undefined;
      const total = common.reduce((sum, s) => sum + (r.scenes[s] as number), 0);
      const refTotal = common.reduce((sum, s) => sum + (ref.scenes[s] as number), 0);
      return {
        name: r.name,
        normalized: r.normalized,
        score: Math.round((1000 * total) / refTotal) / 10,
        samples: r.samples,
      };
    })
    .filter((p): p is CpuPerf => !!p)
    .sort((a, b) => b.score - a.score);
}
