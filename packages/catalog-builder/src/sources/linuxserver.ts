import { type AppRecord, appKey, type SourceAdapter, type SourcePort } from './types';

/** LinuxServer.io API — technical facts only (ports, volumes, architectures), docs/06 § 2.3. */

interface LsioImage {
  name: string;
  project_url?: string;
  category?: string;
  deprecated?: boolean;
  monthly_pulls?: number;
  architectures?: { arch: string }[];
  config?: {
    ports?: { external?: string; internal?: string; desc?: string; optional?: boolean }[];
    volumes?: { path?: string; desc?: string; optional?: boolean }[];
  } | null;
}

const ARCH: Record<string, 'amd64' | 'arm64'> = {
  x86_64: 'amd64',
  amd64: 'amd64',
  arm64: 'arm64',
  aarch64: 'arm64',
};

function port(p: {
  external?: string;
  internal?: string;
  desc?: string;
  optional?: boolean;
}): SourcePort | undefined {
  const [num, proto] = (p.internal ?? '').trim().split('/');
  const container = Number(num);
  const host = Number(String(p.external ?? '').split('/')[0]) || container;
  if (!Number.isInteger(container) || container < 1 || container > 65535) return undefined;
  if (!Number.isInteger(host) || host < 1 || host > 65535) return undefined;
  return {
    container,
    host,
    protocol: proto === 'udp' ? 'udp' : 'tcp',
    description: (p.desc ?? '').trim(),
    optional: !!p.optional,
  };
}

export const linuxserverSource: SourceAdapter = {
  id: 'linuxserver',
  name: 'LinuxServer.io API',
  url: 'https://www.linuxserver.io',
  license: 'facts only',
  priority: 2,
  async fetch(ctx) {
    const response = await ctx.get('https://api.linuxserver.io/api/v1/images?include_config=true');
    return response.json();
  },
  normalize(raw) {
    const images = (raw as { data?: { repositories?: { linuxserver?: LsioImage[] } } }).data
      ?.repositories?.linuxserver;
    if (!Array.isArray(images)) throw new Error('LinuxServer.io: unexpected response shape');
    return images
      .filter((i) => i.name && !i.deprecated)
      .map((i): AppRecord => {
        const arch = [
          ...new Set((i.architectures ?? []).map((a) => ARCH[a.arch]).filter((a) => !!a)),
        ] as ('amd64' | 'arm64')[];
        return {
          kind: 'app',
          source: 'linuxserver',
          key: appKey(i.name),
          ...(i.project_url ? { aliases: [appKey(i.project_url)] } : {}),
          categories: (i.category ?? '')
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean),
          ...(i.monthly_pulls ? { popularity: i.monthly_pulls } : {}),
          image: {
            name: `lscr.io/linuxserver/${i.name}`,
            tag: 'latest',
            arch: arch.length > 0 ? arch : ['amd64'],
            ports: (i.config?.ports ?? []).map(port).filter((p): p is SourcePort => !!p),
            ...((i.config?.ports ?? []).some((p) => /desktop gui/i.test(p.desc ?? ''))
              ? { desktop: true }
              : {}),
            volumes: (i.config?.volumes ?? [])
              .filter((v) => v.path?.startsWith('/'))
              .map((v) => ({
                path: v.path as string,
                description: (v.desc ?? '').trim(),
                optional: !!v.optional,
              })),
          },
        };
      });
  },
};
