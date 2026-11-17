import {
  addInterface,
  connectInterfaces,
  execute,
  type Project,
  updateInterface,
} from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { buildContext, failureImpact, internetAccess, singlePointsOfFailure } from '../src';
import { analyze, apply, byName, homeLab, ifaceOf } from './support';

/** NET-16 bonds: pve1 on two cables to sw-core in an LACP bond under vmbr0. */

function bonded(switchLag: boolean): Project {
  let p = homeLab();
  const pve = byName(p, 'pve1');
  const port2 = ifaceOf(p, 'sw-core', 'Port 2');
  const port7 = ifaceOf(p, 'sw-core', 'Port 7');
  const vmbr0 = ifaceOf(p, 'pve1', 'vmbr0');
  const eth1 = execute(p, addInterface, {
    iface: { owner: { type: 'device', id: pve.id }, name: 'eth1', kind: 'rj45', speedMbps: 1000 },
  });
  p = eth1.project;
  const bond = execute(p, addInterface, {
    iface: {
      owner: { type: 'device', id: pve.id },
      name: 'bond0',
      kind: 'bond',
      parentId: vmbr0.id,
      bond: { mode: 'lacp' },
    },
  });
  p = bond.project;
  for (const member of [ifaceOf(p, 'pve1', 'eth0').id, eth1.result])
    p = apply(p, updateInterface, { id: member, changes: { parentId: bond.result } });
  p = apply(p, connectInterfaces, { a: eth1.result, b: port7.id });
  p = apply(p, updateInterface, {
    id: port7.id,
    changes: { ...(port2.switchport ? { switchport: port2.switchport } : {}) },
  });
  if (switchLag) {
    const sw = byName(p, 'sw-core');
    const lag = execute(p, addInterface, {
      iface: {
        owner: { type: 'device', id: sw.id },
        name: 'lag1',
        kind: 'bond',
        bond: { mode: 'lacp' },
      },
    });
    p = lag.project;
    for (const port of [port2.id, port7.id])
      p = apply(p, updateInterface, { id: port, changes: { parentId: lag.result } });
  }
  return p;
}

const pveCables = (p: Project) => {
  const ports = new Set(
    Object.values(p.interfaces)
      .filter((i) => i.owner.id === byName(p, 'pve1').id)
      .map((i) => i.id),
  );
  return Object.values(p.links).filter((l) => ports.has(l.a) || ports.has(l.b));
};

describe('bonds (NET-16)', () => {
  it('keeps the host online when one bonded cable fails', () => {
    const p = bonded(true);
    const pve = byName(p, 'pve1').id;
    expect(internetAccess(buildContext(p))[pve]).toBe(internetAccess(buildContext(homeLab()))[pve]);
    const [first] = pveCables(p);
    const impact = failureImpact(p, { devices: [], links: [first?.id ?? ''] });
    expect(impact.internetLost).not.toContain(pve);
    const spofLinks = singlePointsOfFailure(p)
      .filter((s) => s.ref.type === 'link')
      .map((s) => s.ref.id);
    for (const cable of pveCables(p)) expect(spofLinks).not.toContain(cable.id);
  });

  it('warns about an LACP bond without a matching LAG and about a one-port bond', () => {
    const codes = (p: Project) => analyze(p).issues.map((i) => i.code);
    expect(codes(bonded(false))).toContain('VAL_BOND_PEER');
    expect(codes(bonded(true))).not.toContain('VAL_BOND_PEER');
    let single = bonded(true);
    const eth1 = ifaceOf(single, 'pve1', 'eth1');
    single = apply(single, updateInterface, { id: eth1.id, changes: { parentId: undefined } });
    expect(codes(single)).toContain('VAL_BOND_PORTS');
  });
});
