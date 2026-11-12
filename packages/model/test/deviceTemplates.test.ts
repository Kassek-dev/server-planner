import { describe, expect, it } from 'vitest';
import {
  addDevice,
  applyDeviceTemplate,
  createId,
  DeviceTemplateSchema,
  deviceTemplateFrom,
  execute,
  type ModelContext,
  ProjectSchema,
} from '../src';
import { buildHomeLab } from './support/home-lab';

const ctx: ModelContext = { createId, now: () => '2026-11-12T08:00:00.000Z' };

describe('device templates (LIB-04)', () => {
  it('saves a device as a template and builds a new device from it', () => {
    const lab = buildHomeLab();
    const pve = Object.values(lab.devices).find((d) => d.name === 'pve1');
    if (!pve) throw new Error('pve1');
    const template = deviceTemplateFrom(lab, pve.id, {
      id: 'tpl_1',
      name: 'My Proxmox box',
      createdAt: ctx.now(),
    });
    expect(DeviceTemplateSchema.safeParse(template).success).toBe(true);

    let { project, result } = execute(lab, addDevice, { kind: 'mini-pc', name: 'pve2' }, ctx);
    ({ project } = execute(project, applyDeviceTemplate, { id: result.deviceId, template }, ctx));
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    const pve2 = project.devices[result.deviceId];
    expect(pve2?.hardware.cpus).toEqual(pve.hardware.cpus);
    expect(pve2?.os?.osId).toBe(pve.os?.osId);
    // Fresh disk and pool IDs, still wired together.
    expect(pve2?.hardware.disks[0]?.id).not.toBe(pve.hardware.disks[0]?.id);
    expect(pve2?.hardware.pools[0]?.diskIds).toEqual(pve2?.hardware.disks.map((d) => d.id));
    const ports = Object.values(project.interfaces).filter((i) => i.owner.id === result.deviceId);
    expect(ports.map((p) => p.name)).toEqual(template.ports.map((p) => p.name));
  });
});
