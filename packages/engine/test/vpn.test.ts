import { addApp, addFirewallRule, addZone, execute, type Project } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { accessMatrix, buildContext, reach } from '../src';
import { analyze, byName, homeLab } from './support';

/** NET-16 VPN zones: remote clients that come in through a VPN server app. */

const MiB = 1024 ** 2;

function withVpn(onRouter: boolean): { p: Project; zone: string } {
  let p = homeLab();
  const host = onRouter ? byName(p, 'gw-01') : byName(p, 'pi-dns');
  const app = execute(p, addApp, {
    app: {
      name: 'WireGuard',
      runsOn: { type: 'device', id: host.id },
      role: 'other',
      tagIds: [],
      listeners: [{ port: 51820, protocol: 'udp', purpose: 'vpn' }],
      requirements: {
        min: { cpu: 0.1, memoryBytes: 64 * MiB, diskBytes: 0 },
        recommended: { cpu: 0.1, memoryBytes: 64 * MiB, diskBytes: 0 },
      },
      dependencies: [],
      trafficPatterns: [],
      confidence: 'estimated',
    },
  });
  p = app.project;
  const zone = execute(p, addZone, {
    zone: {
      name: 'VPN',
      kind: 'vpn',
      color: 'violet',
      intraZone: 'deny',
      vpn: { serverAppId: app.result, protocol: 'wireguard' },
    },
  });
  return { p: zone.project, zone: zone.result };
}

const toNas = (p: Project, zone: string) =>
  reach(buildContext(p), {
    from: { type: 'zone', id: zone },
    to: { type: 'device', id: byName(p, 'nas-01').id },
    protocol: 'tcp',
    port: 445,
  });

describe('VPN zones (NET-16)', () => {
  it('a VPN on the router: its firewall sees the VPN zone as the source', () => {
    const { p, zone } = withVpn(true);
    const blocked = toNas(p, zone);
    expect(blocked.steps[0]?.code).toBe('SIM_VPN_TUNNEL');
    expect(blocked.verdict).toBe('blocked');
    const gw = byName(p, 'gw-01');
    const lan = Object.values(p.zones).find((z) => z.name === 'LAN');
    const allowed = execute(p, addFirewallRule, {
      deviceId: gw.id,
      rule: {
        enabled: true,
        action: 'allow',
        protocol: 'tcp',
        source: { type: 'zone', id: zone },
        destination: { type: 'zone', id: lan?.id ?? '' },
      },
    }).project;
    expect(toNas(allowed, zone).verdict).toBe('reachable');
  });

  it('a VPN on a host masquerades its clients as the host', () => {
    const { p, zone } = withVpn(false);
    const result = toNas(p, zone);
    expect(result.steps[0]?.code).toBe('SIM_VPN_NAT');
  });

  it('shows up in the zone matrix and is checked for a server and a port forward', () => {
    const { p, zone } = withVpn(false);
    const matrix = accessMatrix(buildContext(p));
    expect(matrix.axis.some((a) => a.key === zone)).toBe(true);
    const codes = analyze(p).issues.map((i) => i.code);
    expect(codes).toContain('VAL_VPN_EXPOSED');
    expect(analyze(withVpn(true).p).issues.map((i) => i.code)).not.toContain('VAL_VPN_EXPOSED');
  });
});
