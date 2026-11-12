import {
  addApp,
  addSubnet,
  addVlan,
  addWorkload,
  type Command,
  commands,
  connectInterfaces,
  createProject,
  type Project,
  placeDevice,
  setDeviceOs,
  updateDevice,
  updateInterface,
  updateLocation,
  updateWorkload,
} from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { type Issue, sameDomain } from '../src';
import { analyze, apply, byName, homeLab, ifaceOf } from './support';

const GiB = 1024 ** 3;
const codes = (issues: Issue[], severity?: Issue['severity']) =>
  issues
    .filter((i) => !severity || i.severity === severity)
    .map((i) => i.code)
    .sort();

/** Applies an issue's suggested fix through the model command registry. */
function applyFix(project: Project, issue: Issue): Project {
  if (!issue.fix) throw new Error(`${issue.code} has no fix`);
  const command = commands[issue.fix.command] as Command<unknown, unknown> | undefined;
  if (!command) throw new Error(`unknown command ${issue.fix.command}`);
  return apply(project, command, issue.fix.payload);
}

describe('home-lab fixture (the mockup lab)', () => {
  const lab = homeLab();
  const result = analyze(lab);

  it('reports exactly the two errors shown in the mockups', () => {
    expect(codes(result.issues, 'error')).toEqual(['VAL_01', 'VAL_04']);
    const dup = result.issues.find((i) => i.code === 'VAL_01');
    expect(dup?.params.ip).toBe('192.168.20.15');
    const vlan = result.issues.find((i) => i.code === 'VAL_04');
    expect(vlan?.params).toMatchObject({ vlan: '30', device: 'sw-core', port: 'Port 8' });
  });

  it('marks devices touched by errors', () => {
    expect(result.deviceStatus[byName(lab, 'sw-core').id]).toBe('error');
    expect(result.deviceStatus[byName(lab, 'nas-01').id]).toBe('error');
    expect(result.deviceStatus[byName(lab, 'pve1').id]).toBe('error'); // docker-vm's vNIC is on pve1
    expect(result.deviceStatus[byName(lab, 'gw-01').id]).toBe('ok');
  });

  it('fixes are real commands that remove the issue', () => {
    let project = lab;
    for (const code of ['VAL_04', 'VAL_01']) {
      const found = analyze(project).issues.find((i) => i.code === code);
      if (!found) throw new Error(code);
      project = applyFix(project, found);
      expect(codes(analyze(project).issues)).not.toContain(code);
    }
    expect(codes(analyze(project).issues, 'error')).toEqual([]);
  });

  it('computes capacity per host and per VM', () => {
    const pve = result.capacity[byName(lab, 'pve1').id];
    expect(pve?.cpu.capacity).toBe(6 * 4);
    expect(pve?.cpu.used).toBeCloseTo(0.5 + 2 + 2 + 1);
    expect(pve?.memory.capacity).toBe(32 * GiB);
    expect(pve?.memory.used).toBe(1 * GiB + 8 * GiB + 4 * GiB + 2 * GiB);
    expect(pve?.memory.breakdown.map((b) => b.kind)).toEqual([
      'os',
      'workload',
      'workload',
      'workload',
    ]);
    const pool = pve?.storage[0];
    expect(pool?.capacity).toBeCloseTo(1_000_204_886_016 * 0.9);
    expect(pool?.used).toBe(128 * GiB + 16 * GiB + 16 * GiB + 2 * GiB);
    const vm = Object.values(lab.workloads).find((w) => w.name === 'docker-vm');
    const guest = result.capacity[vm?.id ?? ''];
    expect(guest?.cpu).toMatchObject({ capacity: 2, used: 2, status: 'critical' });
    expect(guest?.cpu.breakdown[0]?.unbounded).toBe(true);
  });

  it('layout-only changes keep the same domain', () => {
    const moved = { ...lab, layout: { ...lab.layout, groupByLocation: false } };
    expect(sameDomain(lab, moved)).toBe(true);
    expect(
      sameDomain(
        lab,
        apply(lab, updateDevice, { id: byName(lab, 'nas-01').id, changes: { hostname: 'x' } }),
      ),
    ).toBe(false);
  });
});

describe('rules', () => {
  const lab = homeLab();
  const has = (p: Project, code: string) => codes(analyze(p).issues).includes(code);

  it('VAL-02 IP outside the assigned subnet', () => {
    const nas = ifaceOf(lab, 'nas-01', 'eth0');
    const lan = nas.addresses[0]?.subnetId ?? '';
    expect(
      has(
        apply(lab, updateInterface, {
          id: nas.id,
          changes: { addresses: [{ mode: 'static', address: '10.0.0.5', subnetId: lan }] },
        }),
        'VAL_02',
      ),
    ).toBe(true);
  });

  it('VAL-03 static IP inside the DHCP pool, with a fix', () => {
    const nas = ifaceOf(lab, 'nas-01', 'eth0');
    const p = apply(lab, updateInterface, {
      id: nas.id,
      changes: {
        addresses: [
          { mode: 'static', address: '192.168.20.150', subnetId: nas.addresses[0]?.subnetId ?? '' },
        ],
      },
    });
    const found = analyze(p).issues.find((i) => i.code === 'VAL_03');
    expect(found?.severity).toBe('warning');
    expect(codes(analyze(applyFix(p, found as Issue)).issues)).not.toContain('VAL_03');
  });

  it('VAL-04 access VLAN not carried by the trunk', () => {
    const port3 = ifaceOf(lab, 'sw-core', 'Port 3');
    const iot = Object.values(lab.vlans).find((v) => v.vid === 30)?.id ?? '';
    const nasEth = ifaceOf(lab, 'nas-01', 'eth0');
    let p = apply(lab, updateInterface, {
      id: nasEth.id,
      changes: { switchport: { mode: 'trunk', allowedVlanIds: [] } },
    });
    p = apply(p, updateInterface, {
      id: port3.id,
      changes: { switchport: { mode: 'access', accessVlanId: iot } },
    });
    expect(analyze(p).issues.filter((i) => i.code === 'VAL_04').length).toBeGreaterThanOrEqual(2);
  });

  it('VAL-05 copper to fiber', () => {
    const port = ifaceOf(lab, 'sw-core', 'Port 3');
    expect(
      has(apply(lab, updateInterface, { id: port.id, changes: { kind: 'sfp+' } }), 'VAL_05'),
    ).toBe(true);
  });

  it('VAL-06 loop between switches', () => {
    let p = apply(lab, commands['device.add'] as Command<{ kind: 'switch' }, unknown>, {
      kind: 'switch',
    });
    const sw2 = Object.values(p.devices).find((d) => d.name === 'switch-1');
    if (!sw2) throw new Error('sw2');
    p = apply(p, connectInterfaces, {
      a: ifaceOf(p, 'sw-core', 'Port 5').id,
      b: ifaceOf(p, 'switch-1', 'Port 1').id,
    });
    p = apply(p, connectInterfaces, {
      a: ifaceOf(p, 'sw-core', 'Port 6').id,
      b: ifaceOf(p, 'switch-1', 'Port 2').id,
    });
    expect(has(p, 'VAL_06')).toBe(true);
  });

  it('VAL-07 VLAN without subnet and subnet without gateway (with fix)', () => {
    let p = apply(lab, addVlan, { vlan: { vid: 99, name: 'Lab', color: 'teal' } });
    expect(has(p, 'VAL_07_VLAN')).toBe(true);
    p = apply(p, addSubnet, { subnet: { cidr: '10.99.0.0/24' } });
    const found = analyze(p).issues.find((i) => i.code === 'VAL_07_GATEWAY');
    expect(found?.fix).toBeDefined();
    expect(has(applyFix(p, found as Issue), 'VAL_07_GATEWAY')).toBe(false);
  });

  it('VAL-08 isolated device is info, not a device error', () => {
    const p = apply(lab, commands['device.add'] as Command<{ kind: 'nas' }, unknown>, {
      kind: 'nas',
    });
    const found = analyze(p).issues.find((i) => i.code === 'VAL_08_ISOLATED');
    expect(found?.severity).toBe('info');
  });

  it('VAL-09 overlapping subnets', () => {
    expect(
      has(
        apply(lab, addSubnet, { subnet: { cidr: '192.168.20.128/25', gateway: '192.168.20.129' } }),
        'VAL_09',
      ),
    ).toBe(true);
  });

  it('VAL-10 two containers publishing the same host port', () => {
    const vm = Object.values(lab.workloads).find((w) => w.name === 'docker-vm');
    const jelly = Object.values(lab.workloads).find((w) => w.name === 'jellyfin');
    if (!vm || jelly?.kind !== 'container') throw new Error('fixture');
    const p = apply(lab, addWorkload, {
      workload: { ...jelly, name: 'emby', id: undefined } as never,
    });
    expect(has(p, 'VAL_10')).toBe(true);
  });

  it('VAL-11 VM on a host without a hypervisor', () => {
    const pve = byName(lab, 'pve1');
    expect(
      has(
        apply(lab, setDeviceOs, { id: pve.id, os: { osId: 'debian', version: '12' } }),
        'VAL_11_HYPERVISOR',
      ),
    ).toBe(true);
  });

  it('VAL-13 over capacity is an error', () => {
    const vm = Object.values(lab.workloads).find((w) => w.name === 'docker-vm');
    if (vm?.kind !== 'vm') throw new Error('fixture');
    const p = apply(lab, updateWorkload, {
      id: vm.id,
      changes: { resources: { ...vm.resources, memoryBytes: 64 * GiB } },
    });
    const found = analyze(p).issues.find((i) => i.code === 'VAL_13_OVER');
    expect(found?.params).toMatchObject({ host: 'pve1', resource: 'memory' });
  });

  it('VAL-14 required dependency without provider', () => {
    const pve = byName(lab, 'pve1');
    const p = apply(lab, addApp, {
      app: {
        name: 'Immich',
        runsOn: { type: 'device', id: pve.id },
        tagIds: [],
        listeners: [],
        requirements: {
          min: { cpu: 1, memoryBytes: GiB, diskBytes: 1e9 },
          recommended: { cpu: 1, memoryBytes: GiB, diskBytes: 1e9 },
        },
        dependencies: [{ capability: 'postgresql', optional: false }],
        trafficPatterns: [],
        confidence: 'estimated',
      },
    });
    expect(has(p, 'VAL_14')).toBe(true);
  });

  it('rack: shrinking the rack puts devices out of range', () => {
    const rack = Object.values(lab.locations).find((l) => l.kind === 'rack');
    if (!rack) throw new Error('fixture');
    expect(
      has(
        apply(lab, updateLocation, { id: rack.id, changes: { units: 10 } }),
        'VAL_RACK_OUT_OF_RANGE',
      ),
    ).toBe(true);
  });

  it('rack: overlapping devices', () => {
    const rack = Object.values(lab.locations).find((l) => l.kind === 'rack');
    const sw = byName(lab, 'sw-core');
    if (!rack) throw new Error('fixture');
    expect(
      has(apply(lab, placeDevice, { id: sw.id, locationId: rack.id, u: 12 }), 'VAL_RACK_OVERLAP'),
    ).toBe(true);
  });

  it('broken references after deletions are reported', () => {
    const piDns = byName(lab, 'pi-dns');
    const p = apply(lab, commands['device.delete'] as Command<{ id: string }, unknown>, {
      id: piDns.id,
    });
    expect(has(p, 'VAL_REF_RULE')).toBe(true);
  });

  it('an empty project has no issues', () => {
    expect(analyze(createProject('Empty')).issues).toEqual([]);
  });
});
