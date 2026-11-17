import { execute, type Project, updateDevice } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { mdnsDomains, mdnsVisible } from '../src';
import { analyze, byName, homeLab } from './support';

/** NET-16 mDNS reflection: which VLANs discover each other's services. */

const vlan = (p: Project, vid: number) => {
  const v = Object.values(p.vlans).find((x) => x.vid === vid);
  if (!v) throw new Error(`no VLAN ${vid}`);
  return v.id;
};
const reflect = (p: Project, name: string, vids: number[]) =>
  execute(p, updateDevice, {
    id: byName(p, name).id,
    changes: { mdnsReflector: { vlanIds: vids.map((v) => vlan(p, v)) } },
  }).project;

describe('mDNS reflector (NET-16)', () => {
  it('keeps mDNS inside each VLAN without a reflector', () => {
    const p = homeLab();
    const domains = mdnsDomains(p);
    expect(domains.every((d) => d.vlanIds.length === 1)).toBe(true);
    expect(mdnsVisible(domains, vlan(p, 20), vlan(p, 30))).toBe(false);
  });

  it('a router reflecting LAN and IoT joins them into one discovery domain', () => {
    const p = reflect(homeLab(), 'gw-01', [20, 30]);
    const domains = mdnsDomains(p);
    expect(mdnsVisible(domains, vlan(p, 30), vlan(p, 20))).toBe(true);
    expect(mdnsVisible(domains, vlan(p, 10), vlan(p, 20))).toBe(false);
    expect(domains.find((d) => d.vlanIds.length === 2)?.reflectors).toEqual([
      byName(p, 'gw-01').id,
    ]);
    expect(analyze(p).issues.map((i) => i.code)).not.toContain('VAL_MDNS_VLAN');
  });

  it('warns when the reflector has no interface in a listed VLAN', () => {
    const p = reflect(homeLab(), 'pi-dns', [20, 30]);
    expect(analyze(p).issues.filter((i) => i.code === 'VAL_MDNS_VLAN').length).toBeGreaterThan(0);
  });
});
