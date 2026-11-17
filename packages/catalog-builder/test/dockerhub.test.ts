import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dockerHubSource, hubRepository, imageFromTags } from '../src/sources/dockerhub';

/** Docker Hub adapter (docs/06 § 2.4) on a recorded response. */

const sample = JSON.parse(
  readFileSync(join(import.meta.dirname, 'samples/dockerhub/jellyfin.json'), 'utf8'),
);

describe('Docker Hub', () => {
  it('maps image references to Docker Hub repositories and skips other registries', () => {
    expect(hubRepository('jellyfin/jellyfin')).toBe('jellyfin/jellyfin');
    expect(hubRepository('postgres:16')).toBe('library/postgres');
    expect(hubRepository('docker.io/library/redis')).toBe('library/redis');
    expect(hubRepository('lscr.io/linuxserver/jellyfin')).toBeUndefined();
    expect(hubRepository('ghcr.io/immich-app/immich-server')).toBeUndefined();
    expect(hubRepository('registry.local:5000/app')).toBeUndefined();
  });

  it('takes the newest version tag and the architectures, size and date of latest', () => {
    expect(imageFromTags('jellyfin/jellyfin', sample.results)).toEqual({
      kind: 'image',
      source: 'dockerhub',
      image: 'jellyfin/jellyfin',
      version: '10.11.3',
      arch: ['amd64', 'arm64'],
      sizeBytes: 420000000,
      updatedAt: '2026-11-10T09:00:00.000Z',
    });
    expect(imageFromTags('x/y', [])).toBeUndefined();
  });

  it('fetches one page per image and stops at the rate limit', async () => {
    const urls: string[] = [];
    const ok = (body: unknown, remaining = '100') =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'x-ratelimit-remaining': remaining },
      });
    const raw = await dockerHubSource.fetch({
      workDir: '',
      images: ['jellyfin/jellyfin', 'lscr.io/linuxserver/sonarr', 'postgres:16', 'redis'],
      download: async () => '',
      get: async (url) => {
        urls.push(url);
        return url.includes('library/postgres') ? ok(sample, '0') : ok(sample);
      },
    });
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain('/v2/repositories/library/postgres/tags');
    const records = await dockerHubSource.normalize(raw);
    expect(records.map((r) => (r.kind === 'image' ? r.image : ''))).toEqual([
      'jellyfin/jellyfin',
      'postgres',
    ]);
  });
});
