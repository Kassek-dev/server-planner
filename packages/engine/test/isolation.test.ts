import {
  addDevice,
  connectInterfaces,
  type Project,
  updateDevice,
  updateInterface,
} from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { buildContext, reach } from '../src';
import { apply, byName, homeLab, ifaceOf } from './support';

/** NET-12: stations on an SSID with client isolation cannot reach each other at L2. */

function twoStations(isolation: boolean): Project {
  let p = homeLab();
  const ap = byName(p, 'ap-living');
  p = apply(p, updateDevice, {
    id: ap.id,
    changes: {
      wifi: {
        ssids: (ap.wifi?.ssids ?? []).map((s) =>
          s.id === 'ssid-iot' ? { ...s, clientIsolation: isolation } : s,
        ),
      },
    },
  });
  p = apply(p, addDevice, { kind: 'client', name: 'phone' });
  const subnet = Object.values(p.subnets).find((s) => s.cidr === '192.168.30.0/24');
  if (!subnet) throw new Error('no IoT subnet');
  p = apply(p, connectInterfaces, {
    a: ifaceOf(p, 'ap-living', 'wlan0').id,
    b: ifaceOf(p, 'phone', 'wlan0').id,
    ssidId: 'ssid-iot',
  });
  for (const [device, ip] of [
    ['phone', '192.168.30.51'],
    ['tv-salon', '192.168.30.50'],
  ] as const)
    p = apply(p, updateInterface, {
      id: ifaceOf(p, device, 'wlan0').id,
      changes: { addresses: [{ mode: 'static', address: ip, subnetId: subnet.id }] },
    });
  return p;
}

const ping = (p: Project, from: string, to: string) =>
  reach(buildContext(p), {
    from: { type: 'device', id: byName(p, from).id },
    to: { type: 'device', id: byName(p, to).id },
    protocol: 'icmp',
  });

describe('Wi-Fi client isolation (NET-12)', () => {
  it('stations on the same SSID reach each other without isolation', () => {
    expect(ping(twoStations(false), 'phone', 'tv-salon').verdict).toBe('reachable');
  });

  it('isolation blocks station to station with its own reason', () => {
    const result = ping(twoStations(true), 'phone', 'tv-salon');
    expect(result.verdict).toBe('blocked');
    const step = result.blockedAt !== undefined ? result.steps[result.blockedAt] : undefined;
    expect(step?.code).toBe('SIM_L2_CLIENT_ISOLATION');
    expect(step?.params).toMatchObject({ ssid: 'Home-IoT' });
  });
});
