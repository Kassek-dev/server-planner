import { describe, expect, it } from 'vitest';
import { RACK_HEADER } from './geometry';
import { locationAt, toFlowEdges, toFlowNodes } from './graph';
import { deviceByName, homeLab } from './testSupport';

const lab = homeLab();
const nodes = toFlowNodes(lab);
const node = (name: string) => nodes.find((n) => n.id === deviceByName(lab, name).id);
const rack = Object.values(lab.locations).find((l) => l.kind === 'rack');

describe('toFlowNodes', () => {
  it('puts locations before the devices they contain', () => {
    const firstDevice = nodes.findIndex((n) => n.type === 'device');
    expect(nodes.slice(0, firstDevice).every((n) => n.type === 'location')).toBe(true);
  });

  it('derives rack device positions from units (U12 is the top row)', () => {
    const gw = node('gw-01');
    expect(gw?.parentId).toBe(rack?.id);
    expect(gw?.data.variant).toBe('rack-row');
    expect(gw?.position.y).toBe(RACK_HEADER + 1);
    const nas = node('nas-01');
    expect(nas?.data.size.h).toBe(2 * 26 - 2);
  });

  it('shows standalone devices on a rack shelf as chips', () => {
    expect(node('pi-dns')?.data.variant).toBe('shelf-chip');
  });

  it('keeps tiles in rooms and shelves relative to the location', () => {
    const pve = node('pve1');
    expect(pve?.data.variant).toBe('tile');
    expect(pve?.parentId).toBe(deviceByName(lab, 'pve1').placement?.locationId);
    expect(node('Internet')?.parentId).toBeUndefined();
  });

  it('reports free rack units', () => {
    const rackNode = nodes.find((n) => n.id === rack?.id);
    expect(rackNode?.type === 'location' && rackNode.data.freeUnits).toBe(7);
  });
});

describe('toFlowEdges', () => {
  const edges = toFlowEdges(lab);

  it('draws physical links only (vNIC ↔ bridge is not drawn)', () => {
    expect(edges).toHaveLength(
      Object.values(lab.links).filter((l) => l.medium !== 'virtual').length,
    );
    expect(edges).toHaveLength(7);
  });

  it('styles links by VLAN and mode', () => {
    const between = (a: string, b: string) =>
      edges.find(
        (e) =>
          (e.source === deviceByName(lab, a).id && e.target === deviceByName(lab, b).id) ||
          (e.source === deviceByName(lab, b).id && e.target === deviceByName(lab, a).id),
      );
    expect(between('sw-core', 'ap-living')?.style).toMatchObject({ strokeWidth: 4 });
    expect(between('sw-core', 'nas-01')?.style).toMatchObject({
      stroke: 'var(--sp-vlan-sky)',
      strokeWidth: 3,
    });
    expect(between('ap-living', 'tv-salon')?.style).toMatchObject({
      stroke: 'var(--sp-vlan-pink)',
      strokeDasharray: '6 5',
    });
    expect(between('Internet', 'gw-01')?.style).toMatchObject({ stroke: 'var(--sp-port-wan)' });
  });
});

describe('locationAt', () => {
  it('finds the location under a point and nothing elsewhere', () => {
    const rect = lab.layout.locations[rack?.id ?? '']?.rect;
    if (!rect) throw new Error('fixture');
    expect(locationAt(lab, { x: rect.x * 16 + 40, y: rect.y * 16 + 60 })?.id).toBe(rack?.id);
    expect(locationAt(lab, { x: -500, y: -500 })).toBeUndefined();
  });
});
