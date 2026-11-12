import {
  type Command,
  commands,
  type Project,
  updateFirewallRule,
  updateInterface,
  updateWorkload,
} from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import {
  analyze,
  buildContext,
  type ReachabilityResult,
  type ReachQuery,
  reach,
  visibleFrom,
} from '../src';
import { apply, byName, homeLab, ifaceOf } from './support';

const run = (p: Project, q: ReachQuery) => reach(buildContext(p), q);
const failing = (r: ReachabilityResult) =>
  r.blockedAt === undefined ? undefined : r.steps[r.blockedAt];

const ref = (p: Project, name: string) => ({ type: 'device' as const, id: byName(p, name).id });
const jellyfin = (p: Project) => {
  const app = Object.values(p.apps).find((a) => a.name === 'Jellyfin');
  if (!app) throw new Error('no Jellyfin');
  return { type: 'app' as const, id: app.id };
};

/** The home lab with VLAN 30 allowed towards the access point (the VAL-04 fix). */
function iotFixed(): Project {
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

describe('reach() on the mockup lab — "Can my TV reach Jellyfin?"', () => {
  const tvToJellyfin = (p: Project): ReachQuery => ({
    from: ref(p, 'tv-salon'),
    to: jellyfin(p),
    protocol: 'tcp',
    port: 8096,
  });

  it('stops at L2 while VLAN 30 is not allowed on sw-core Port 8', () => {
    const p = homeLab();
    const r = run(p, tvToJellyfin(p));
    expect(r.verdict).toBe('blocked');
    expect(failing(r)).toMatchObject({
      layer: 'l2',
      code: 'SIM_L2_VLAN_NOT_ALLOWED',
      params: { interface: 'Port 8', device: 'sw-core', segment: '30 (IoT)' },
    });
    expect(r.path.devices).not.toContain(byName(p, 'pve1').id);
  });

  it('is then blocked by firewall rule #4 IoT → LAN, with an applicable fix', () => {
    const p = iotFixed();
    const r = run(p, tvToJellyfin(p));
    expect(r.steps.map((s) => s.code)).toEqual([
      'SIM_L2_TO_GATEWAY',
      'SIM_L3_ROUTE',
      'SIM_FW_RULE_DENY',
    ]);
    expect(failing(r)?.params.rule).toBe(4);
    expect(failing(r)?.ruleRef?.type).toBe('rule');
    expect(r.fix?.command).toBe('firewall.addRule');

    const command = commands[r.fix?.command ?? ''] as Command<unknown, unknown>;
    const fixed = apply(p, command, r.fix?.payload);
    const after = run(fixed, tvToJellyfin(fixed));
    expect(after.verdict).toBe('reachable');
    expect(after.steps.map((s) => s.code)).toEqual([
      'SIM_L2_TO_GATEWAY',
      'SIM_L3_ROUTE',
      'SIM_FW_RULE_ALLOW',
      'SIM_L2_TO_TARGET',
      'SIM_DOCKER_PUBLISHED',
      'SIM_APP_LISTENING',
    ]);
    expect(after.path.devices).toEqual(
      expect.arrayContaining(
        ['tv-salon', 'ap-living', 'sw-core', 'gw-01', 'pve1'].map((n) => byName(fixed, n).id),
      ),
    );
  });

  it('same-subnet traffic skips the firewall', () => {
    const p = homeLab();
    const r = run(p, { from: ref(p, 'nas-01'), to: jellyfin(p), protocol: 'tcp', port: 8096 });
    expect(r.verdict).toBe('reachable');
    expect(r.steps.some((s) => s.layer === 'firewall')).toBe(false);
  });

  it('reports unpublished Docker ports and apps not listening', () => {
    const p = homeLab();
    const from = ref(p, 'nas-01');
    const unpublished = run(p, { from, to: jellyfin(p), protocol: 'tcp', port: 9000 });
    expect(failing(unpublished)?.code).toBe('SIM_DOCKER_NOT_PUBLISHED');

    const container = Object.values(p.workloads).find((w) => w.name === 'jellyfin');
    if (!container) throw new Error('no container');
    const mapped = apply(p, updateWorkload, {
      id: container.id,
      changes: { portMappings: [{ hostPort: 8097, containerPort: 8097, protocol: 'tcp' }] },
    });
    const silent = run(mapped, { from, to: jellyfin(mapped), protocol: 'tcp', port: 8097 });
    expect(failing(silent)?.code).toBe('SIM_APP_NOT_LISTENING');
  });

  it('internet: masquerade on WAN, uplink to the Internet node', () => {
    const p = homeLab();
    const r = run(p, { from: ref(p, 'pve1'), to: 'internet', protocol: 'tcp', port: 443 });
    expect(r.verdict).toBe('reachable');
    expect(r.steps.map((s) => s.layer)).toEqual(['l2', 'l3', 'firewall', 'nat', 'l3']);
    expect(r.path.devices).toContain(byName(p, 'Internet').id);
  });

  it('a disabled allow rule falls through to the default deny', () => {
    const p = homeLab();
    const gw = byName(p, 'gw-01');
    const lanRule = gw.firewall?.rules[0];
    if (!lanRule) throw new Error('no rule');
    const off = apply(p, updateFirewallRule, {
      deviceId: gw.id,
      ruleId: lanRule.id,
      changes: { enabled: false },
    });
    const r = run(off, { from: ref(off, 'nas-01'), to: 'internet', protocol: 'tcp', port: 443 });
    expect(failing(r)?.code).toBe('SIM_FW_DEFAULT_DENY');
    expect(r.fix?.payload).toMatchObject({ index: 5, rule: { destination: { type: 'internet' } } });
  });

  it('devices without a network address give an unknown verdict', () => {
    const p = homeLab();
    const r = run(p, { from: ref(p, 'sw-core'), to: 'internet', protocol: 'icmp' });
    expect(r.verdict).toBe('unknown');
    expect(failing(r)?.code).toBe('SIM_SRC_NO_NETWORK');
  });
});

describe('access summary', () => {
  it('internet access: IoT clients get only HTTPS (partial)', () => {
    const p = iotFixed();
    const { internet } = analyze(p);
    expect(internet[byName(p, 'tv-salon').id]).toBe('partial');
    expect(internet[byName(p, 'pve1').id]).toBe('full');
    expect(internet[byName(p, 'sw-core').id]).toBeUndefined();
    expect(analyze(homeLab()).internet[byName(p, 'tv-salon').id]).toBe('none');
  });

  it('visible from: lists every app listener with its verdict', () => {
    const p = iotFixed();
    const ctx = buildContext(p);
    const fromTv = visibleFrom(ctx, ref(p, 'tv-salon'));
    expect(fromTv).toHaveLength(1);
    expect(fromTv[0]).toMatchObject({ port: 8096, protocol: 'tcp' });
    expect(fromTv[0]?.result.verdict).toBe('blocked');
    expect(visibleFrom(ctx, ref(p, 'nas-01'))[0]?.result.verdict).toBe('reachable');
  });
});
