import { addHostFirewallRule, execute, type Project, setHostFirewall } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { buildContext, reach } from '../src';
import { byName, homeLab } from './support';

/** NET-15 host firewall: checked at the receiving host, after routing and the router firewall. */

const dns = (p: Project) =>
  reach(buildContext(p), {
    from: { type: 'device', id: byName(p, 'nas-01').id },
    to: { type: 'device', id: byName(p, 'pi-dns').id },
    protocol: 'udp',
    port: 53,
  });
const owner = (p: Project) => ({ type: 'device' as const, id: byName(p, 'pi-dns').id });

describe('host firewall (NET-15)', () => {
  it('drops incoming traffic by default once enabled', () => {
    let p = homeLab();
    expect(dns(p).verdict).toBe('reachable');
    p = execute(p, setHostFirewall, { owner: owner(p), enabled: true }).project;
    const result = dns(p);
    expect(result.verdict).toBe('blocked');
    expect(result.steps.at(-1)?.code).toBe('SIM_HOSTFW_DEFAULT_DENY');
  });

  it('a rule for the source lets it in; the first matching rule wins', () => {
    let p = homeLab();
    p = execute(p, setHostFirewall, { owner: owner(p), enabled: true }).project;
    const lan = Object.values(p.zones).find((z) => z.name === 'LAN');
    if (!lan) throw new Error('no LAN zone');
    p = execute(p, addHostFirewallRule, {
      owner: owner(p),
      rule: {
        enabled: true,
        action: 'allow',
        protocol: 'udp',
        source: { type: 'zone', id: lan.id },
        ports: [{ from: 53, to: 53 }],
      },
    }).project;
    const allowed = dns(p);
    expect(allowed.verdict).toBe('reachable');
    expect(allowed.steps.some((s) => s.code === 'SIM_HOSTFW_RULE_ALLOW')).toBe(true);
  });

  it('a disabled firewall filters nothing; containers cannot have one', () => {
    let p = homeLab();
    p = execute(p, setHostFirewall, { owner: owner(p), enabled: true }).project;
    p = execute(p, setHostFirewall, { owner: owner(p), enabled: false }).project;
    expect(dns(p).verdict).toBe('reachable');
    const container = Object.values(p.workloads).find((w) => w.kind === 'container');
    expect(() =>
      execute(p, setHostFirewall, {
        owner: { type: 'workload', id: container?.id ?? '' },
        enabled: true,
      }),
    ).toThrow(/HOST_FIREWALL_CONTAINER/);
  });

  it('filters what a host sends when outgoing traffic is dropped by default (1.10)', () => {
    let p = homeLab();
    const nas = { type: 'device' as const, id: byName(p, 'nas-01').id };
    p = execute(p, setHostFirewall, {
      owner: nas,
      enabled: true,
      inbound: 'allow',
      outbound: 'deny',
    }).project;
    const blocked = dns(p);
    expect(blocked.verdict).toBe('blocked');
    expect(blocked.steps.find((s) => s.decision === 'fail')?.code).toBe(
      'SIM_HOSTFW_OUT_DEFAULT_DENY',
    );
    p = execute(p, addHostFirewallRule, {
      owner: nas,
      rule: {
        enabled: true,
        direction: 'out',
        action: 'allow',
        protocol: 'udp',
        source: { type: 'any' },
        destination: { type: 'device', id: byName(p, 'pi-dns').id },
        ports: [{ from: 53, to: 53 }],
      },
    }).project;
    const allowed = dns(p);
    expect(allowed.verdict).toBe('reachable');
    expect(allowed.steps.some((s) => s.code === 'SIM_HOSTFW_OUT_RULE_ALLOW')).toBe(true);
  });
});
