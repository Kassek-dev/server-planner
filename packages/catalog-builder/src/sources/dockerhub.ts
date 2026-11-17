import { imageKey } from '@server-planner/model';
import type { ImageRecord, SourceAdapter } from './types';

/**
 * Docker Hub (`docs/06` § 2.4) — technical facts about images already in the catalog: the newest
 * version tag, the architectures and compressed size of `latest` (or that version) and the last
 * push. One request per image; images on other registries (lscr.io, ghcr.io, quay.io) are skipped.
 * The source stops early when Docker Hub reports its rate limit; images left out keep the data of
 * the previous run (merged by the builder).
 */

interface HubTag {
  name: string;
  last_updated?: string;
  full_size?: number;
  images?: { architecture?: string; os?: string; size?: number }[];
}

const ARCH: Record<string, 'amd64' | 'arm64'> = { amd64: 'amd64', arm64: 'arm64' };
const VERSION = /^v?\d+\.\d+(\.\d+)?$/;
/** Images checked per run (one request each) — the weekly budget. */
export const MAX_IMAGES = 280;
/** Pause between requests: Docker Hub allows 180 per minute without an account. */
export const REQUEST_GAP_MS = 400;

/** Docker Hub repository of an image reference, or undefined for other registries. */
export function hubRepository(image: string): string | undefined {
  const first = image.split('/')[0] ?? '';
  // A registry host has a dot or a port; docker.io is Docker Hub itself.
  if (image.includes('/') && /[.:]/.test(first) && !/^(docker\.io|index\.docker\.io)$/.test(first))
    return undefined;
  const key = imageKey(image);
  if (!key) return undefined;
  return key.includes('/') ? key : `library/${key}`;
}

/** The record of one image from its tag list (newest first). */
export function imageFromTags(image: string, tags: HubTag[]): ImageRecord | undefined {
  if (tags.length === 0) return undefined;
  const version = tags.find((t) => VERSION.test(t.name));
  const reference = tags.find((t) => t.name === 'latest') ?? version ?? tags[0];
  if (!reference) return undefined;
  const arch = [
    ...new Set(
      (reference.images ?? [])
        .filter((i) => (i.os ?? 'linux') === 'linux')
        .flatMap((i) => (i.architecture && ARCH[i.architecture] ? [ARCH[i.architecture]] : [])),
    ),
  ].sort() as ('amd64' | 'arm64')[];
  const size =
    reference.full_size ??
    reference.images?.find((i) => i.architecture === 'amd64')?.size ??
    reference.images?.[0]?.size;
  return {
    kind: 'image',
    source: 'dockerhub',
    image: imageKey(image),
    ...(version ? { version: version.name } : {}),
    arch,
    ...(typeof size === 'number' && size >= 0 ? { sizeBytes: Math.round(size) } : {}),
    ...(reference.last_updated
      ? { updatedAt: new Date(reference.last_updated).toISOString() }
      : {}),
  };
}

export const dockerHubSource: SourceAdapter = {
  id: 'dockerhub',
  name: 'Docker Hub',
  url: 'https://hub.docker.com',
  license: 'facts only',
  priority: 3,
  async fetch(ctx) {
    const repositories = [
      ...new Set(
        (ctx.images ?? []).map((i) => [i, hubRepository(i)] as const).filter(([, r]) => r),
      ),
    ].slice(0, MAX_IMAGES);
    const out: { image: string; tags: HubTag[] }[] = [];
    const gap = ctx.workDir ? REQUEST_GAP_MS : 0;
    for (const [image, repository] of repositories) {
      if (out.length > 0 && gap) await new Promise((r) => setTimeout(r, gap));
      let response: Response;
      try {
        response = await ctx.get(
          `https://hub.docker.com/v2/repositories/${repository}/tags?page_size=25&ordering=last_updated`,
        );
      } catch (error) {
        // A missing repository is no reason to stop; the rate limit (429) is.
        if (String(error).includes('HTTP 429')) break;
        continue;
      }
      const body = (await response.json()) as { results?: HubTag[] };
      out.push({ image, tags: Array.isArray(body.results) ? body.results : [] });
      if (response.headers.get('x-ratelimit-remaining') === '0') break;
    }
    return out;
  },
  normalize(raw) {
    if (!Array.isArray(raw)) throw new Error('Docker Hub: unexpected response shape');
    return (raw as { image: string; tags: HubTag[] }[]).flatMap((r) => {
      const record = imageFromTags(r.image, r.tags);
      return record ? [record] : [];
    });
  },
};
