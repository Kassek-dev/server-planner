import { z } from 'zod';
import { CatalogRefSchema, IdSchema } from './common';
import { HardwareSchema, OsInstallSchema, PurchaseSchema, UpsSpecSchema } from './hardware';
import { FormFactorSchema, PlacementSchema } from './location';
import { FirewallSchema, SwitchCapabilitiesSchema, WifiConfigSchema } from './network';
import { DockerRuntimeSchema } from './workload';

/** Devices — docs/02-model-danych.md § 4. */

export const DEVICE_KINDS = [
  'internet',
  'modem',
  'router',
  'firewall',
  'switch',
  'access-point',
  'server',
  'mini-pc',
  'sbc',
  'nas',
  'ups',
  'patch-panel',
  'client',
] as const;
export const DeviceKindSchema = z.enum(DEVICE_KINDS);

export const CLIENT_TYPES = [
  'pc',
  'laptop',
  'phone',
  'tv',
  'console',
  'iot',
  'camera',
  'printer',
  'other',
] as const;

export const DeviceSchema = z.object({
  id: IdSchema,
  kind: DeviceKindSchema,
  clientType: z.enum(CLIENT_TYPES).optional(),
  name: z.string().min(1),
  hostname: z.string().optional(),
  description: z.string().optional(),
  tagIds: z.array(IdSchema),
  physicalLabel: z.string().optional(),
  catalogRef: CatalogRefSchema.optional(),

  /** D9 — absent only for the `internet` node. */
  formFactor: FormFactorSchema.optional(),
  placement: PlacementSchema.optional(),

  hardware: HardwareSchema,
  os: OsInstallSchema.optional(),
  docker: DockerRuntimeSchema.optional(),
  switching: SwitchCapabilitiesSchema.optional(),
  firewall: FirewallSchema.optional(),
  wifi: WifiConfigSchema.optional(),
  ups: UpsSpecSchema.optional(),
  purchase: PurchaseSchema.optional(),
});

export type DeviceKind = z.infer<typeof DeviceKindSchema>;
export type ClientType = (typeof CLIENT_TYPES)[number];
export type Device = z.infer<typeof DeviceSchema>;

/** Device kinds that can run an OS, VMs, containers and apps. */
export const COMPUTE_KINDS: readonly DeviceKind[] = ['server', 'mini-pc', 'sbc', 'nas'];
