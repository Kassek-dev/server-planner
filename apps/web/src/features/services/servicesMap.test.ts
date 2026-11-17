import { type Project, parseProjectFile } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import raw from '../../../../../fixtures/schema/v4/reverse-proxy.json';
import { homeLab } from '../canvas/testSupport';
import { servicesMap } from './servicesMap';

const lab = (): Project => parseProjectFile(raw).file.project;
const appId = (p: Project, name: string) =>
  Object.values(p.apps).find((a) => a.name === name)?.id ?? '';

describe('services map (VIEW-07)', () => {
  it('lays out names, the proxy and the app behind it from left to right', () => {
    const p = lab();
    const map = servicesMap(p);
    const column = (id: string) => map.nodes.find((n) => n.id === id)?.column;
    expect(column('name:media.home.arpa')).toBe(0);
    expect(column('name:jellyfin.home.arpa')).toBe(1);
    expect(column(appId(p, 'Caddy'))).toBe(2);
    expect(column(appId(p, 'Jellyfin'))).toBe(3);
    expect(map.edges).toContainEqual({
      from: appId(p, 'Caddy'),
      to: appId(p, 'Jellyfin'),
      kind: 'route',
      label: '8096',
    });
    expect(map.edges).toContainEqual({
      from: 'name:media.home.arpa',
      to: 'name:jellyfin.home.arpa',
      kind: 'record',
    });
  });

  it('shows where an app runs and its required dependencies without a provider', () => {
    const p = homeLab();
    const jellyfin = Object.values(p.apps)[0];
    if (!jellyfin) throw new Error('no app');
    const withDep: Project = {
      ...p,
      apps: {
        ...p.apps,
        [jellyfin.id]: {
          ...jellyfin,
          dependencies: [{ capability: 'database', optional: false }],
        },
      },
    };
    const map = servicesMap(withDep);
    const node = map.nodes.find((n) => n.id === jellyfin.id);
    expect(node).toMatchObject({ kind: 'app', column: 0 });
    expect(node?.kind === 'app' && node.host.length).toBeGreaterThan(0);
    expect(map.nodes).toContainEqual(
      expect.objectContaining({ kind: 'missing', capability: 'database', column: 1 }),
    );
  });

  it('an empty project has an empty map', () => {
    const p = homeLab();
    expect(servicesMap({ ...p, apps: {}, proxyRoutes: {}, dnsRecords: {} })).toMatchObject({
      nodes: [],
      edges: [],
      columns: 0,
    });
  });
});
