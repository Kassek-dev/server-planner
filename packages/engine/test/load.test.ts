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

  it('raises the CPU of the host by the app load profile (1.10)', () => {
    const p = homeLab();
    const profiles = {
      jellyfin: [
        {
          id: 'typical',
          name: { en: 'Typical' },
          params: [{ key: 'transcodes', name: { en: 'Transcodes' }, default: 1, min: 0, max: 8 }],
          resources: { cpu: 1.5, memoryBytes: 1024 ** 3, diskBytes: 0 },
          perParam: { transcodes: { cpu: 1, memoryBytes: 0.25 * 1024 ** 3 } },
        },
      ],
    };
    const ctx = buildContext(p, { loadProfiles: profiles });
    const app = Object.values(p.apps)[0];
    const withApp = items(p, 4).map((i) => ({
      ...i,
      appId: app?.id ?? '',
      catalogAppId: 'jellyfin',
    }));
    const result = scenarioLoad(ctx, withApp);
    // Jellyfin runs in docker-vm: the VM works harder (its allocation caps what pve1 sees).
    const vm = Object.values(p.workloads).find((w) => w.name === 'docker-vm');
    const load = result.hosts.find((h) => h.host.id === vm?.id);
    expect(load?.host.type).toBe('workload');
    expect(load?.cpuRatio).toBeGreaterThan(load?.baselineCpuRatio ?? 1);
    // Without a profile the hosts stay as they are.
    expect(scenarioLoad(buildContext(p), withApp).hosts).toEqual([]);
  });
});
