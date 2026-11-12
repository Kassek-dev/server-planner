import {
  type CatalogFlow,
  type Project,
  updateInterface,
  updateSubnet,
} from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { buildContext, runFlow } from '../src';
import { apply, byName, homeLab, ifaceOf } from './support';

const playMovie: CatalogFlow = {
  id: 'jellyfin.play-movie',
  name: { en: 'Client plays a movie' },
  roles: [
    { key: 'client', name: { en: 'Client' }, selector: { kind: 'lan-clients' }, userPicks: true },
    { key: 'server', name: { en: 'Jellyfin' }, selector: { kind: 'self' }, userPicks: false },
    {
      key: 'storage',
      name: { en: 'Media storage' },
      selector: { kind: 'dependency', capability: 'media-storage' },
      userPicks: true,
    },
  ],
  steps: [
    {
      from: 'client',
      to: 'server',
      protocol: 'tcp',
      purpose: 'web-ui',
      resolveDns: true,
      bandwidthMbps: 40,
    },
    { from: 'server', to: 'storage', protocol: 'tcp', port: 2049, optional: true },
  ],
};

function lab(): Project {
  let p = homeLab();
  const port8 = ifaceOf(p, 'sw-core', 'Port 8');
  p = apply(p, updateInterface, {
    id: port8.id,
    changes: {
      switchport: {
        mode: 'trunk',
        nativeVlanId: 'vln_0009',
        allowedVlanIds: ['vln_0010', 'vln_0011'],
      },
    },
  });
  // Every subnet asks pi-dns (192.168.20.2).
  for (const subnet of Object.values(p.subnets))
    p = apply(p, updateSubnet, {
      id: subnet.id,
      changes: { dns: { servers: [{ type: 'ip', value: '192.168.20.2' }] } },
    });
  return p;
}
const jellyfin = (p: Project) => ({ type: 'app' as const, id: Object.values(p.apps)[0]?.id ?? '' });
const device = (p: Project, name: string) => ({ type: 'device' as const, id: byName(p, name).id });

describe('runFlow (FLW-03)', () => {
  it('expands the process into DNS and app hops with the published port', () => {
    const p = lab();
    const run = runFlow(buildContext(p), {
      flow: playMovie,
      bindings: { client: device(p, 'nas-01'), server: jellyfin(p), storage: undefined },
    });
    expect(run.hops.map((h) => [h.kind, h.protocol, h.port])).toEqual([
      ['dns', 'udp', 53],
      ['step', 'tcp', 8096],
    ]);
    expect(run.hops.every((h) => h.result.verdict === 'reachable')).toBe(true);
    expect(run.hops[1]?.bandwidthMbps).toBe(40);
    expect(run.skipped).toEqual([1]);
    expect(run.verdict).toBe('reachable');
  });

  it('stops at the firewall for an IoT client', () => {
    const p = lab();
    const run = runFlow(buildContext(p), {
      flow: playMovie,
      bindings: {
        client: device(p, 'tv-salon'),
        server: jellyfin(p),
        storage: device(p, 'nas-01'),
      },
    });
    expect(run.hops[0]?.kind).toBe('dns');
    expect(run.hops[0]?.result.verdict).toBe('reachable'); // rule #2 IoT → pi-dns udp/53
    const blocked = run.hops[1]?.result;
    expect(blocked?.verdict).toBe('blocked');
    expect(blocked?.steps[blocked.blockedAt ?? 0]?.code).toBe('SIM_FW_RULE_DENY');
    expect(run.hops).toHaveLength(3);
    expect(run.verdict).toBe('blocked');
  });

  it('reports a required role without a participant', () => {
    const p = lab();
    const run = runFlow(buildContext(p), { flow: playMovie, bindings: { server: jellyfin(p) } });
    expect(run.hops[0]?.result.steps[0]?.code).toBe('SIM_FLOW_UNBOUND');
    expect(run.verdict).toBe('unknown');
  });
});
