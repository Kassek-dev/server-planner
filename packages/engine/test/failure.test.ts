import { addDevice, connectInterfaces, type Project, updateInterface } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { affectsOthers, failureImpact, singlePointsOfFailure } from '../src';
import { apply, byName, homeLab, ifaceOf } from './support';

/** SIM-07: "what if X fails?" and single points of failure on the home lab. */

/** Home lab + a LAN laptop on sw-core port 6 with a static address (reaches Jellyfin). */
function withLaptop(): Project {
  let p = homeLab();
  p = apply(p, addDevice, { kind: 'client', name: 'laptop' });
  p = apply(p, connectInterfaces, {
    a: ifaceOf(p, 'laptop', 'eth0').id,
    b: ifaceOf(p, 'sw-core', 'Port 6').id,
  });
  const lan = Object.values(p.subnets).find((s) => s.cidr === '192.168.20.0/24');
  if (!lan) throw new Error('no LAN');
  p = apply(p, updateInterface, {
    id: ifaceOf(p, 'sw-core', 'Port 6').id,
    changes: { switchport: { mode: 'access', accessVlanId: lan.vlanId ?? '' } },
  });
  return apply(p, updateInterface, {
    id: ifaceOf(p, 'laptop', 'eth0').id,
    changes: { addresses: [{ mode: 'static', address: '192.168.20.60', subnetId: lan.id }] },
  });
}
const id = (p: Project, name: string) => byName(p, name).id;

describe('failure analysis (SIM-07)', () => {
  it('a failed router cuts the lab off the internet', () => {
    const p = homeLab();
    const impact = failureImpact(p, { devices: [id(p, 'gw-01')], links: [] });
    expect(impact.internetLost).toEqual(expect.arrayContaining([id(p, 'nas-01'), id(p, 'pve1')]));
    expect(impact.internetLost).not.toContain(id(p, 'gw-01'));
    expect(affectsOthers(impact)).toBe(true);
  });

  it('apps on a failed host are down; clients lose apps behind a failed switch', () => {
    const p = withLaptop();
    const jellyfin = Object.values(p.apps)[0]?.id ?? '';
    const host = failureImpact(p, { devices: [id(p, 'pve1')], links: [] });
    expect(host.apps).toContainEqual({
      appId: jellyfin,
      down: true,
      lostClients: [id(p, 'laptop')],
    });
    const sw = failureImpact(p, { devices: [id(p, 'sw-core')], links: [] });
    expect(sw.apps.find((a) => a.appId === jellyfin)).toMatchObject({
      down: false,
      lostClients: [id(p, 'laptop')],
    });
  });

  it('a power cut without a UPS takes everything but the Internet down', () => {
    const p = homeLab();
    const impact = failureImpact(p, { devices: [], links: [], powerCut: true });
    expect(impact.failedDevices).toHaveLength(Object.keys(p.devices).length - 1);
    expect(impact.failedDevices).not.toContain(id(p, 'Internet'));
  });

  it('finds the router, the core switch and their cables as single points of failure', () => {
    const p = homeLab();
    const spofs = singlePointsOfFailure(p);
    const devices = spofs.filter((s) => s.ref.type === 'device').map((s) => s.ref.id);
    expect(devices).toEqual(expect.arrayContaining([id(p, 'gw-01'), id(p, 'sw-core')]));
    expect(devices).not.toContain(id(p, 'ap-living'));
    expect(spofs.some((s) => s.ref.type === 'link')).toBe(true);
  });
});
