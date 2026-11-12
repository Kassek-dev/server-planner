import {
  addAssertion,
  addFirewallRule,
  addNatRule,
  type Project,
  updateInterface,
} from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { accessMatrix, buildContext, exposure } from '../src';
import { analyze, apply, byName, homeLab, ifaceOf } from './support';

function lab(): Project {
  const p = homeLab();
  const port8 = ifaceOf(p, 'sw-core', 'Port 8');
  return apply(p, updateInterface, {
    id: port8.id,
    changes: {
      switchport: {
        mode: 'trunk',
        nativeVlanId: 'vln_0009',
        allowedVlanIds: ['vln_0010', 'vln_0011'],
      },
    },
  });
}
const zone = (p: Project, name: string) =>
  Object.values(p.zones).find((z) => z.name === name)?.id ?? '';
const jellyfin = (p: Project) => Object.values(p.apps)[0]?.id ?? '';

describe('exposure from the internet (SIM-05)', () => {
  it('follows a port forward through the firewall to the app', () => {
    let p = lab();
    const gw = byName(p, 'gw-01');
    p = apply(p, addNatRule, {
      deviceId: gw.id,
      rule: {
        kind: 'port-forward',
        inInterfaceId: ifaceOf(p, 'gw-01', 'wan0').id,
        protocol: 'tcp',
        externalPort: 443,
        target: { appId: jellyfin(p), port: 8096 },
      },
    });
    let [forward] = exposure(buildContext(p));
    expect(forward?.result.verdict).toBe('blocked');
    expect(forward?.result.steps.map((s) => s.code)).toEqual([
      'SIM_INTERNET_INBOUND',
      'SIM_NAT_PORT_FORWARD',
      'SIM_FW_DEFAULT_DENY',
    ]);

    p = apply(p, addFirewallRule, {
      deviceId: gw.id,
      rule: {
        enabled: true,
        action: 'allow',
        protocol: 'tcp',
        source: { type: 'internet' },
        destination: { type: 'app', id: jellyfin(p) },
        ports: [{ from: 8096, to: 8096 }],
      },
    });
    [forward] = exposure(buildContext(p));
    expect(forward?.result.verdict).toBe('reachable');
    expect(forward?.result.steps.at(-1)?.code).toBe('SIM_APP_LISTENING');
    expect(forward?.result.path.devices).toContain(byName(p, 'Internet').id);
  });
});

describe('assertions (SIM-06)', () => {
  it('checks expectations and reports broken ones as issues', () => {
    let p = lab();
    const iot = zone(p, 'IoT');
    const lan = zone(p, 'LAN');
    p = apply(p, addAssertion, {
      assertion: {
        name: 'IoT ↛ LAN',
        source: { type: 'zone', id: iot },
        destination: { type: 'zone', id: lan },
        protocol: 'any',
        expect: 'blocked',
        enabled: true,
      },
    });
    p = apply(p, addAssertion, {
      assertion: {
        name: 'LAN → web',
        source: { type: 'zone', id: lan },
        destination: { type: 'internet' },
        protocol: 'tcp',
        port: 443,
        expect: 'reachable',
        enabled: true,
      },
    });
    p = apply(p, addAssertion, {
      assertion: {
        name: 'TV → Jellyfin',
        source: { type: 'device', id: byName(p, 'tv-salon').id },
        destination: { type: 'app', id: jellyfin(p) },
        protocol: 'tcp',
        port: 8096,
        expect: 'reachable',
        enabled: true,
      },
    });
    const result = analyze(p);
    expect(
      result.assertions.map((a) => [p.assertions[a.assertionId]?.name, a.actual, a.passed]),
    ).toEqual([
      ['IoT ↛ LAN', 'blocked', true],
      ['LAN → web', 'reachable', true],
      ['TV → Jellyfin', 'blocked', false],
    ]);
    const broken = result.issues.filter((i) => i.code === 'VAL_ASSERT');
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({
      severity: 'warning',
      params: { name: 'TV → Jellyfin', actual: 'blocked' },
    });
  });
});

describe('access matrix (SIM-04)', () => {
  it('summarises zone to zone and to the internet', () => {
    const p = lab();
    const m = accessMatrix(buildContext(p));
    const at = (from: string, to: string) => {
      const i = m.axis.findIndex((a) => a.label === from);
      const j = m.axis.findIndex((a) => a.label === to);
      return m.cells[i]?.[j];
    };
    expect(m.axis.map((a) => a.label)).toEqual(['Mgmt', 'LAN', 'IoT', 'Internet']);
    // Rule 2 lets IoT reach the LAN DNS server only.
    expect(at('IoT', 'LAN')).toMatchObject({ status: 'partial', allowed: 1 });
    expect(at('LAN', 'Internet')?.status).toBe('full');
    expect(at('IoT', 'Internet')).toMatchObject({ status: 'partial', allowed: 1 });
    expect(at('Internet', 'LAN')?.status).toBe('none');
    expect(at('IoT', 'Mgmt')?.status).toBe('none');
  });
});
