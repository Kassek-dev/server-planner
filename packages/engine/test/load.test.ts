import type { CatalogFlow, Project } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { buildContext, scenarioLoad } from '../src';
import { byName, homeLab, ifaceOf } from './support';

/** FLW-06/07: streams from Jellyfin to nas-01 add up on the cables they cross. */

const stream: CatalogFlow = {
  id: 'jellyfin.stream',
  name: { en: 'Stream a movie' },
  roles: [
    { key: 'client', name: { en: 'Client' }, selector: { kind: 'lan-clients' }, userPicks: true },
    { key: 'server', name: { en: 'Jellyfin' }, selector: { kind: 'self' }, userPicks: false },
  ],
  steps: [{ from: 'client', to: 'server', protocol: 'tcp', purpose: 'web-ui', bandwidthMbps: 40 }],
};

const items = (p: Project, count: number) => [
  {
    flow: stream,
    count,
    bindings: {
      client: { type: 'device' as const, id: byName(p, 'nas-01').id },
      server: { type: 'app' as const, id: Object.values(p.apps)[0]?.id ?? '' },
    },
  },
];
const cableOf = (p: Project, device: string, port: string) => {
  const iface = ifaceOf(p, device, port);
  return Object.values(p.links).find((l) => l.a === iface.id || l.b === iface.id)?.id;
};

describe('link load (FLW-06/07)', () => {
  it('adds bandwidth × count to every cable on the path', () => {
    const p = homeLab();
    const result = scenarioLoad(buildContext(p), items(p, 3));
    expect(result.failed).toBe(0);
    const nas = result.links.find((l) => l.linkId === cableOf(p, 'nas-01', 'eth0'));
    expect(nas).toMatchObject({ loadMbps: 120, capacityMbps: 1000, ratio: 0.12 });
  });

  it('names the most loaded cable as the bottleneck', () => {
    const p = homeLab();
    const result = scenarioLoad(buildContext(p), items(p, 30));
    expect(result.links[0]?.ratio).toBeGreaterThan(1);
    expect(result.bottleneck).toBe(result.links[0]?.linkId);
  });
});
