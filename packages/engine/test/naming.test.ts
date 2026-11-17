import { addDevice, execute, type Project, updateProject } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { analyze, byName, homeLab } from './support';

/** LBL-05 naming conventions and host names. */

const withNaming = (p: Project, hostnames = false): Project =>
  execute(p, updateProject, {
    changes: {
      settings: {
        ...p.settings,
        naming: { site: 'home', patterns: { switch: '{site}-{kind}-{nn}' }, hostnames },
      },
    },
  }).project;

describe('naming conventions (LBL-05)', () => {
  it('names new devices by the pattern of their kind', () => {
    let p = withNaming(homeLab());
    const first = execute(p, addDevice, { kind: 'switch' });
    p = first.project;
    expect(p.devices[first.result.deviceId]?.name).toBe('home-sw-01');
    const second = execute(p, addDevice, { kind: 'switch' });
    expect(second.project.devices[second.result.deviceId]?.name).toBe('home-sw-02');
    // Kinds without a pattern keep the default names.
    const ap = execute(p, addDevice, { kind: 'access-point' });
    expect(ap.project.devices[ap.result.deviceId]?.name).toMatch(/^access-point-\d+$/);
  });

  it('flags names outside the pattern with a rename to the next free name', () => {
    const p = withNaming(homeLab());
    const issue = analyze(p).issues.find(
      (i) => i.code === 'VAL_NAMING' && i.targets[0]?.id === byName(p, 'sw-core').id,
    );
    expect(issue).toMatchObject({
      severity: 'info',
      params: { suggestion: 'home-sw-01' },
      fix: { command: 'device.update', payload: { changes: { name: 'home-sw-01' } } },
    });
  });

  it('checks host names only when asked to', () => {
    let p = homeLab();
    const added = execute(p, addDevice, { kind: 'server', name: 'Media Server' });
    p = added.project;
    const codes = (q: Project) => analyze(q).issues.map((i) => i.code);
    expect(codes(withNaming(p, false))).not.toContain('VAL_HOSTNAME');
    const issue = analyze(withNaming(p, true)).issues.find((i) => i.code === 'VAL_HOSTNAME');
    expect(issue?.params).toMatchObject({ hostname: 'Media Server', suggestion: 'media-server' });
  });
});
