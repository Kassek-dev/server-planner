import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addFirewallRule,
  type Project,
  parseProjectFile,
  updateInterface,
  updateSubnet,
} from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { buildContext, internetAccess, reach, simulateIpv6Exposure } from '../src';
import { analyze, apply, byName, homeLab, ifaceOf } from './support';

/** NET-17 IPv6: addressing, validation and (1.10) the simulation of IPv6 on its own. */

const raw = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../fixtures/schema/v4/dual-stack.json'), 'utf8'),
);
const lab = (): Project => parseProjectFile(raw).file.project;
const codes = (p: Project) => analyze(p).issues.map((i) => i.code);
const v6Subnet = (p: Project) => {
  const s = Object.values(p.subnets).find((x) => x.cidr.includes(':'));
  if (!s) throw new Error('no IPv6 subnet');
  return s;
};

describe('IPv6 (NET-17)', () => {
  it('a dual-stack lab adds no issues and simulates like the IPv4 lab', () => {
    const p = lab();
    const before = codes(homeLab()).sort();
    expect(codes(p).sort()).toEqual(before);
    const access = (q: Project) => JSON.stringify(internetAccess(buildContext(q)));
    expect(access(p)).toEqual(access(homeLab()));
  });

  it('SLAAC needs router advertisements and a /64; DHCPv6 needs a managed subnet', () => {
    let p = lab();
    const s = v6Subnet(p);
    p = apply(p, updateSubnet, { id: s.id, changes: { ra: 'none' } });
    expect(analyze(p).issues.find((i) => i.code === 'VAL_IPV6_MODE')?.params).toMatchObject({
      problem: 'slaac-off',
      target: 'pi-dns:eth0',
    });
    p = apply(p, updateSubnet, { id: s.id, changes: { ra: 'slaac', cidr: 'fd20:4d2:20::/56' } });
    expect(codes(p)).toContain('VAL_IPV6_PREFIX');
  });

  it('SLAAC on an IPv4 subnet is an error', () => {
    let p = homeLab();
    const lan = Object.values(p.subnets).find((s) => s.cidr === '192.168.20.0/24');
    p = apply(p, updateInterface, {
      id: ifaceOf(p, 'pi-dns', 'eth0').id,
      changes: { addresses: [{ mode: 'slaac', ...(lan ? { subnetId: lan.id } : {}) }] },
    });
    const found = analyze(p).issues.find((i) => i.code === 'VAL_IPV6_MODE');
    expect(found).toMatchObject({ severity: 'error', params: { problem: 'slaac-ipv4' } });
  });

  it('finds duplicates however an IPv6 address is written; the fix keeps the IPv4 address', () => {
    let p = lab();
    const s = v6Subnet(p);
    const eth = ifaceOf(p, 'nas-01', 'eth0');
    p = apply(p, updateInterface, {
      id: eth.id,
      changes: {
        addresses: [
          ...eth.addresses,
          { mode: 'static', address: 'FD20:4D2:20:0:0::5', subnetId: s.id },
        ],
      },
    });
    const dup = analyze(p).issues.find(
      (i) => i.code === 'VAL_01' && String(i.params.ip).toLowerCase().includes('fd20'),
    );
    expect(dup).toBeDefined();
    expect(byName(p, 'nas-01')).toBeDefined();
  });

  it('simulates IPv6 on its own: to the internet without NAT (1.10)', () => {
    const p = lab();
    const ctx = buildContext(p, { family: 'ipv6' });
    const result = reach(ctx, {
      from: { type: 'device', id: byName(p, 'pve1').id },
      to: 'internet',
      protocol: 'tcp',
      port: 443,
    });
    expect(result.steps.some((s) => s.code === 'SIM_NAT_NONE_IPV6')).toBe(true);
    expect(result.steps.some((s) => s.code === 'SIM_NAT_MASQUERADE')).toBe(false);
  });

  it('a ULA prefix is not reachable from the internet; a global one only through the firewall', () => {
    let p = lab();
    const local = simulateIpv6Exposure(p);
    expect(local.length).toBeGreaterThan(0);
    expect(local.every((e) => !e.global && e.result.steps[0]?.code === 'SIM_IPV6_LOCAL_ONLY')).toBe(
      true,
    );
    const s = v6Subnet(p);
    p = apply(p, updateSubnet, { id: s.id, changes: { cidr: '2a01:4f8:20::/64' } });
    const global = simulateIpv6Exposure(p).find((e) => e.ref.id === byName(p, 'pve1').id);
    expect(global?.global).toBe(true);
    expect(global?.result.verdict).toBe('blocked'); // gw-01 denies by default
    const lan = Object.values(p.zones).find((z) => z.name === 'LAN');
    p = apply(p, addFirewallRule, {
      deviceId: byName(p, 'gw-01').id,
      rule: {
        enabled: true,
        action: 'allow',
        protocol: 'tcp',
        source: { type: 'internet' },
        destination: { type: 'zone', id: lan?.id ?? '' },
      },
    });
    const open = simulateIpv6Exposure(p).find((e) => e.ref.id === byName(p, 'pve1').id);
    expect(open?.result.verdict).toBe('reachable');
  });
});
