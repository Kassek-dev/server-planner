import { z } from 'zod';
import { clone } from './clone';
import { applyPorts } from './commands/catalog';
import { CommandError, defineCommand, getOrThrow } from './commands/core';
import { IsoDateSchema } from './schema/common';
import { DeviceSchema } from './schema/device';
import { InterfaceKindSchema, PoeSchema } from './schema/network';
import type { Project } from './schema/project';

/**
 * LIB-04 own device templates ("save as template"), kept in this browser — not in the project.
 * A template holds what makes a device reusable: kind, form factor, hardware, OS and ports.
 */

export const DeviceTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: IsoDateSchema,
  device: DeviceSchema.pick({
    kind: true,
    clientType: true,
    formFactor: true,
    hardware: true,
    os: true,
    docker: true,
    switching: true,
    ups: true,
    purchase: true,
  }),
  ports: z.array(
    z.object({
      name: z.string().min(1),
      kind: InterfaceKindSchema,
      speedMbps: z.number().positive().optional(),
      poe: PoeSchema.pick({ role: true, standard: true }).optional(),
    }),
  ),
});
export type DeviceTemplate = z.infer<typeof DeviceTemplateSchema>;

const PHYSICAL = new Set(['rj45', 'sfp', 'sfp+', 'sfp28', 'qsfp+', 'wifi-radio', 'wan']);

export function deviceTemplateFrom(
  project: Project,
  deviceId: string,
  meta: { id: string; name: string; createdAt: string },
): DeviceTemplate {
  const device = project.devices[deviceId];
  if (!device) throw new CommandError('NOT_FOUND', { entity: 'device', id: deviceId });
  const { kind, clientType, formFactor, hardware, os, docker, switching, ups, purchase } =
    clone(device);
  const ports: DeviceTemplate['ports'] = Object.values(project.interfaces)
    .filter((i) => i.owner.type === 'device' && i.owner.id === deviceId && PHYSICAL.has(i.kind))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((i) => ({
      name: i.name,
      kind: i.kind,
      ...(i.speedMbps ? { speedMbps: i.speedMbps } : {}),
      ...(i.poe
        ? { poe: { role: i.poe.role, ...(i.poe.standard ? { standard: i.poe.standard } : {}) } }
        : {}),
    }));
  return {
    ...meta,
    device: {
      kind,
      ...(clientType ? { clientType } : {}),
      ...(formFactor ? { formFactor } : {}),
      hardware,
      ...(os ? { os } : {}),
      ...(docker ? { docker } : {}),
      ...(switching ? { switching } : {}),
      ...(ups ? { ups } : {}),
      ...(purchase ? { purchase } : {}),
    },
    ports,
  };
}

/** Applies a template to a device of the same kind; disk and pool IDs are new per device. */
export const applyDeviceTemplate = defineCommand(
  'device.applyTemplate',
  (draft, { id, template }: { id: string; template: DeviceTemplate }, ctx) => {
    const device = getOrThrow(draft.devices, id, 'device');
    if (device.kind !== template.device.kind)
      throw new CommandError('MODEL_KIND_MISMATCH', {
        kind: device.kind,
        model: template.device.kind,
      });
    const { hardware, os, ...rest } = clone(template.device);
    const disks = new Map(hardware.disks.map((d) => [d.id, ctx.createId('disk')]));
    const pools = new Map(hardware.pools.map((p) => [p.id, ctx.createId('storagePool')]));
    device.hardware = {
      ...hardware,
      disks: hardware.disks.map((d) => ({ ...d, id: disks.get(d.id) ?? d.id })),
      pools: hardware.pools.map((p) => ({
        ...p,
        id: pools.get(p.id) ?? p.id,
        diskIds: p.diskIds.map((d) => disks.get(d) ?? d),
      })),
    };
    if (os) {
      const bootPoolId = os.bootPoolId ? pools.get(os.bootPoolId) : undefined;
      const { bootPoolId: _, ...osRest } = os;
      device.os = { ...osRest, ...(bootPoolId ? { bootPoolId } : {}) };
    }
    Object.assign(device, rest);
    applyPorts(draft, id, template.ports, ctx);
  },
);
