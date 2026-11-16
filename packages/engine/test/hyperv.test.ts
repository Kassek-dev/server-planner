import { addWorkload, execute, type Project, setDeviceOs } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { analyze, byName, homeLab } from './support';

/** SW-14 Hyper-V on Windows Server: VMs yes, LXC no. */

const GiB = 1024 ** 3;

function windowsHost(): Project {
  const p = homeLab();
  return execute(p, setDeviceOs, {
    id: byName(p, 'nas-01').id,
    os: { osId: 'windows-server', version: '2025' },
  }).project;
}

const guest = (p: Project, kind: 'vm' | 'lxc') =>
  execute(p, addWorkload, {
    workload: {
      kind,
      name: `${kind}-1`,
      host: { type: 'device', id: byName(p, 'nas-01').id },
      tagIds: [],
      resources: { vcpu: 2, memoryBytes: 2 * GiB, disks: [] },
      ...(kind === 'vm' ? { guestOs: { osId: 'debian', version: '12' } } : {}),
    } as never,
  }).project;

const hypervisorIssues = (p: Project) =>
  analyze(p).issues.filter((i) => i.code === 'VAL_11_HYPERVISOR');

describe('Hyper-V (SW-14)', () => {
  it('a Windows Server host gets the External virtual switch', () => {
    const p = windowsHost();
    const nas = byName(p, 'nas-01');
    const bridge = Object.values(p.interfaces).find(
      (i) => i.owner.id === nas.id && i.kind === 'bridge',
    );
    expect(bridge?.name).toBe('External');
  });

  it('runs VMs but not LXC', () => {
    expect(hypervisorIssues(guest(windowsHost(), 'vm'))).toEqual([]);
    const lxc = hypervisorIssues(guest(windowsHost(), 'lxc'));
    expect(lxc).toHaveLength(1);
    expect(lxc[0]?.params).toMatchObject({ guest: 'lxc', os: 'windows-server' });
  });
});
