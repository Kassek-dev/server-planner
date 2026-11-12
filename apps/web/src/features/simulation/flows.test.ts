import { beforeAll, describe, expect, it } from 'vitest';
import { useCatalog } from '../../catalog/store';
import { deviceByName, homeLab } from '../canvas/testSupport';
import { candidates, defaultBindings, flowApps, targetOf } from './flows';

const lab = homeLab();
beforeAll(async () => {
  await useCatalog.getState().load();
});

describe('flows in the app (FLW-01/02)', () => {
  it('finds apps with catalog processes, also by name', () => {
    const apps = flowApps(lab, useCatalog.getState().catalog);
    expect(apps.map((a) => a.entry.id)).toEqual(['jellyfin']);
    expect(apps[0]?.entry.flows.map((f) => f.id)).toContain('jellyfin.play-movie');
  });

  it('suggests participants per role', () => {
    const catalog = useCatalog.getState().catalog;
    const [self] = flowApps(lab, catalog);
    if (!self) throw new Error('no flow app');
    const flow = self.entry.flows.find((f) => f.id === 'jellyfin.play-movie');
    if (!flow) throw new Error('no flow');
    const clients = candidates(lab, catalog, { kind: 'lan-clients' }, self);
    expect(clients[0]?.label).toBe('tv-salon · tv');
    expect(clients.some((c) => c.label.startsWith('sw-core'))).toBe(false);
    const storage = candidates(
      lab,
      catalog,
      { kind: 'dependency', capability: 'media-storage' },
      self,
    );
    expect(storage.map((c) => c.value)).toContain(deviceByName(lab, 'nas-01').id);

    const bindings = defaultBindings(lab, catalog, flow, self);
    expect(targetOf(lab, catalog, flow, self, 'server', bindings.server ?? '')).toEqual({
      type: 'app',
      id: self.app.id,
    });
    expect(targetOf(lab, catalog, flow, self, 'client', bindings.client ?? '')).toEqual({
      type: 'device',
      id: deviceByName(lab, 'tv-salon').id,
    });
  });
});
