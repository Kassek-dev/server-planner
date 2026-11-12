import { analyze, buildContext, reach } from '@server-planner/engine';
import { describe, expect, it } from 'vitest';
import { toFlowEdges, toFlowNodes } from './graph';
import { decorateEdges, decorateNodes, deviceZone, linkSpeed } from './overlays';
import { deviceByName, homeLab } from './testSupport';

const lab = homeLab();
const nodes = toFlowNodes(lab);
const edges = toFlowEdges(lab, nodes);
const id = (name: string) => deviceByName(lab, name).id;
const view = { links: 'type', devices: 'none' } as const;

describe('canvas overlays (CAN-06)', () => {
  it('leaves elements untouched by default', () => {
    expect(decorateNodes(nodes, { project: lab, view })).toBe(nodes);
    expect(decorateEdges(edges, { project: lab, view })).toBe(edges);
  });

  it('colors devices by their single internal zone', () => {
    expect(deviceZone(lab, id('nas-01'))).toBe('zon_0007');
    expect(deviceZone(lab, id('gw-01'))).toBeUndefined();
    const zoned = decorateNodes(nodes, { project: lab, view: { ...view, devices: 'zone' } });
    expect(zoned.find((n) => n.id === id('nas-01'))?.style?.outline).toContain('--sp-vlan-sky');
  });

  it('colors devices by capacity status and links by speed', () => {
    const { capacity } = analyze(lab);
    const byCapacity = decorateNodes(nodes, {
      project: lab,
      view: { ...view, devices: 'capacity' },
      capacity,
    });
    expect(byCapacity.find((n) => n.id === id('pve1'))?.style?.outline).toContain('--sp-status');
    const link = Object.values(lab.links)[0];
    if (!link) throw new Error('no link');
    const bySpeed = decorateEdges(edges, { project: lab, view: { ...view, links: 'speed' } });
    const speed = linkSpeed(lab, link);
    const edge = bySpeed.find((e) => e.id === link.id);
    expect(edge?.style?.strokeDasharray).toBe(speed === undefined ? '2 4' : 'none');
  });

  it('highlights the simulation path and marks the blocking hop', () => {
    const result = reach(buildContext(lab), {
      from: { type: 'device', id: id('tv-salon') },
      to: 'internet',
      protocol: 'tcp',
      port: 443,
    });
    const shown = decorateNodes(nodes, { project: lab, view, highlight: result });
    const cls = (name: string) => shown.find((n) => n.id === id(name))?.className;
    expect(cls('sw-core')).toBe('sp-blocked');
    expect(cls('ap-living')).toBe('sp-path');
    expect(cls('nas-01')).toBe('sp-dim');
    const shownEdges = decorateEdges(edges, { project: lab, view, highlight: result });
    expect(shownEdges.filter((e) => e.className === 'sp-blocked')).toHaveLength(1);
  });
});
