import { describe, expect, it } from 'vitest';
import { homeLab } from '../canvas/testSupport';
import { intToIpv4, ipPlan, ipv4ToInt, parseCidr4 } from './plan';

describe('IPv4 helpers', () => {
  it('converts addresses and networks', () => {
    expect(ipv4ToInt('192.168.20.15')).toBe(3232240655);
    expect(intToIpv4(3232240655)).toBe('192.168.20.15');
    expect(ipv4ToInt('300.1.1.1')).toBeUndefined();
    expect(parseCidr4('192.168.20.77/24')).toEqual({
      network: ipv4ToInt('192.168.20.0'),
      prefix: 24,
    });
  });
});

describe('ipPlan', () => {
  const plans = ipPlan(homeLab());
  const lan = plans.find((p) => p.subnet.cidr === '192.168.20.0/24');

  it('lists every subnet in address order', () => {
    expect(plans.map((p) => p.subnet.cidr)).toEqual([
      '192.168.10.0/24',
      '192.168.20.0/24',
      '192.168.30.0/24',
    ]);
  });

  it('marks duplicate addresses and reports the DHCP pool', () => {
    const dupes = lan?.rows.filter((r) => r.type === 'address' && r.ip === '192.168.20.15');
    expect(dupes).toHaveLength(2);
    expect(dupes?.every((r) => r.type === 'address' && r.conflict)).toBe(true);
    expect(lan?.pool).toMatchObject({ from: '192.168.20.100', to: '192.168.20.199', size: 100 });
    expect(lan?.hosts).toBe(254);
  });

  it('collapses unused space into free ranges and the pool into one row', () => {
    const ranges = lan?.rows.filter((r) => r.type !== 'address');
    expect(ranges?.[0]).toEqual({
      type: 'free',
      from: '192.168.20.3',
      to: '192.168.20.14',
      count: 12,
    });
    expect(ranges?.some((r) => r.type === 'pool' && r.count === 100)).toBe(true);
    expect(ranges?.at(-1)).toMatchObject({ type: 'free', to: '192.168.20.254' });
  });
});
