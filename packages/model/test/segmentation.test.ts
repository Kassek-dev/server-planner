import { describe, expect, it } from 'vitest';
import {
  applySegmentation,
  createId,
  createProject,
  execute,
  type ModelContext,
  type Project,
  ProjectSchema,
  planSegmentation,
} from '../src';
import { buildHomeLab } from './support/home-lab';

const ctx: ModelContext = { createId, now: () => '2026-11-12T08:00:00.000Z' };
const router = (p: Project) => Object.values(p.devices).find((d) => d.kind === 'router');
const iface = (p: Project, ownerId: string, name: string) =>
  Object.values(p.interfaces).find((i) => i.owner.id === ownerId && i.name === name);

describe('typical segmentation (NET-10)', () => {
  it('offers only segments whose VLAN and subnet are free', () => {
    const lab = buildHomeLab();
    const gw = router(lab);
    if (!gw) throw new Error('no router');
    const plan = planSegmentation(lab, gw.id);
    expect(plan.available).toEqual(['guest']);
    expect(plan.hasWan).toBe(true);
    expect(plan.trunks.map((i) => i.name)).toEqual(['lan0', 'lan1', 'lan2']);
  });

  it('adds Guest to the home lab: VLAN, subnet, zone, gateway, rule', () => {
    const lab = buildHomeLab();
    const gw = router(lab);
    const lan0 = gw && iface(lab, gw.id, 'lan0');
    if (!gw || !lan0) throw new Error('no router');
    const { project } = execute(
      lab,
      applySegmentation,
      { routerId: gw.id, trunkInterfaceId: lan0.id, segments: ['guest'] },
      ctx,
    );
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    const guest = Object.values(project.zones).find((z) => z.name === 'Guest');
    expect(guest).toMatchObject({ kind: 'internal', intraZone: 'deny' });
    const vlan = Object.values(project.vlans).find((v) => v.vid === 40);
    expect(Object.values(project.subnets).find((s) => s.cidr === '192.168.40.0/24')).toMatchObject({
      vlanId: vlan?.id,
      zoneId: guest?.id,
      gateway: '192.168.40.1',
      dhcp: { enabled: true, rangeStart: '192.168.40.100', rangeEnd: '192.168.40.199' },
    });
    expect(iface(project, gw.id, 'lan0.40')).toMatchObject({
      kind: 'vlan',
      parentId: lan0.id,
      vlanTag: 40,
      zoneId: guest?.id,
    });
    expect(project.interfaces[lan0.id]?.switchport?.allowedVlanIds).toContain(vlan?.id);
    expect(project.devices[gw.id]?.firewall?.rules.at(-1)).toMatchObject({
      action: 'allow',
      source: { type: 'zone', id: guest?.id },
      destination: { type: 'internet' },
    });
    // The existing masquerade covers all zones — no second one.
    expect(project.devices[gw.id]?.firewall?.nat).toHaveLength(1);
  });

  it('rejects a segment whose VLAN already exists', () => {
    const lab = buildHomeLab();
    const gw = router(lab);
    const lan0 = gw && iface(lab, gw.id, 'lan0');
    if (!gw || !lan0) throw new Error('no router');
    expect(() =>
      execute(
        lab,
        applySegmentation,
        { routerId: gw.id, trunkInterfaceId: lan0.id, segments: ['iot'] },
        ctx,
      ),
    ).toThrow();
  });

  it('builds all four segments on a fresh router with WAN zone and masquerade', () => {
    let p = createProject('Fresh', ctx);
    const template = router(buildHomeLab());
    if (!template) throw new Error('no router');
    const deviceId = createId('device');
    const wan = createId('interface');
    const lan = createId('interface');
    p = {
      ...p,
      devices: {
        [deviceId]: {
          ...template,
          id: deviceId,
          firewall: undefined,
        } as never,
      },
      interfaces: {
        [wan]: {
          id: wan,
          owner: { type: 'device', id: deviceId },
          name: 'wan0',
          kind: 'wan',
          addresses: [{ mode: 'dhcp' }],
          enabled: true,
        },
        [lan]: {
          id: lan,
          owner: { type: 'device', id: deviceId },
          name: 'lan0',
          kind: 'rj45',
          addresses: [],
          enabled: true,
        },
      },
    };
    delete (p.devices[deviceId] as { firewall?: unknown }).firewall;
    const { project, result } = execute(
      p,
      applySegmentation,
      { routerId: deviceId, trunkInterfaceId: lan, segments: ['mgmt', 'lan', 'iot', 'guest'] },
      ctx,
    );
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    expect(result.zoneIds).toHaveLength(4);
    expect(
      Object.values(project.zones)
        .map((z) => z.name)
        .sort(),
    ).toEqual(['Guest', 'IoT', 'LAN', 'Mgmt', 'WAN']);
    expect(project.interfaces[wan]?.zoneId).toBeDefined();
    const fw = project.devices[deviceId]?.firewall;
    expect(fw?.defaultAction).toBe('deny');
    expect(fw?.rules).toHaveLength(4);
    expect(fw?.nat).toEqual([expect.objectContaining({ kind: 'masquerade', outInterfaceId: wan })]);
    expect(project.subnets[Object.keys(project.subnets)[0] ?? '']?.dhcp).toBeUndefined();
  });
});
