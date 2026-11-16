import { parseProjectFile } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import dualStack from '../../../../../fixtures/schema/v3/dual-stack.json';
import { homeLab } from '../canvas/testSupport';
import { logicalMap } from './logicalMap';

describe('logical L3 map (VIEW-06)', () => {
  it('groups subnets by zone and connects the router to each of them', () => {
    const map = logicalMap(homeLab());
    expect(map.zones.map((z) => z.name)).toEqual(['IoT', 'LAN', 'Mgmt']);
    expect(map.zones.find((z) => z.name === 'LAN')?.subnets.map((s) => s.cidr)).toEqual([
      '192.168.20.0/24',
    ]);
    const gw = map.routers.find((r) => r.name === 'gw-01');
    expect(gw).toMatchObject({ wan: true, policy: expect.any(String) });
    expect(gw?.subnets).toHaveLength(3);
  });

  it('lists IPv6 subnets after IPv4 ones in their zone', () => {
    const map = logicalMap(parseProjectFile(dualStack).file.project);
    const lan = map.zones.find((z) => z.name === 'LAN');
    expect(lan?.subnets.map((s) => [s.cidr, s.family])).toEqual([
      ['192.168.20.0/24', 'ipv4'],
      ['fd20:4d2:20::/64', 'ipv6'],
    ]);
    expect(map.routers.find((r) => r.name === 'gw-01')?.subnets).toHaveLength(4);
  });
});
