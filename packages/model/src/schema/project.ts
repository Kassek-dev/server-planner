import { z } from 'zod';
import { ColorRefSchema, IdSchema, IsoDateSchema, PortSchema, ProtocolSchema } from './common';
import { DeviceSchema } from './device';
import { LocationSchema } from './location';
import {
  EndpointSchema,
  InterfaceSchema,
  LinkSchema,
  RouteSchema,
  SubnetSchema,
  VlanSchema,
  ZoneSchema,
} from './network';
import { AppInstanceSchema, DockerNetworkSchema, StackSchema, WorkloadSchema } from './workload';

/** Project, layout, annotations and the export file — docs/02-model-danych.md § 3, § 7. */

export const TagSchema = z.object({ id: IdSchema, name: z.string().min(1), color: ColorRefSchema });

export const AssertionSchema = z.object({
  id: IdSchema,
  name: z.string().optional(),
  source: EndpointSchema,
  destination: EndpointSchema,
  protocol: ProtocolSchema,
  port: PortSchema.optional(),
  expect: z.enum(['reachable', 'blocked']),
  enabled: z.boolean(),
});

const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
});

export const NodeLayoutSchema = z.object({
  /** Grid units; relative to the location when the device has a placement. */
  x: z.number(),
  y: z.number(),
  collapsed: z.boolean().optional(),
});

export const NoteSchema = z.object({ id: IdSchema, text: z.string(), rect: RectSchema });

export const LayoutSchema = z.object({
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() }).optional(),
  nodes: z.record(IdSchema, NodeLayoutSchema),
  links: z.record(
    IdSchema,
    z.object({
      routing: z.enum(['straight', 'orthogonal']),
      waypoints: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
    }),
  ),
  locations: z.record(IdSchema, z.object({ rect: RectSchema, collapsed: z.boolean().optional() })),
  groupByLocation: z.boolean(),
  notes: z.record(IdSchema, NoteSchema),
});

export const ProjectSettingsSchema = z.object({
  capacityThresholds: z.object({
    warning: z.number().min(0).max(1),
    critical: z.number().min(0).max(1),
  }),
  defaultOvercommit: z.object({ cpu: z.number().positive(), memory: z.number().positive() }),
  storageFreeReserve: z.number().min(0).max(1),
  energyPrice: z.object({ perKwh: z.number().nonnegative(), currency: z.string() }).optional(),
  currency: z.string().min(1),
});

export const ProjectSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  catalogVersion: z.string(),
  settings: ProjectSettingsSchema,

  devices: z.record(IdSchema, DeviceSchema),
  interfaces: z.record(IdSchema, InterfaceSchema),
  links: z.record(IdSchema, LinkSchema),
  workloads: z.record(IdSchema, WorkloadSchema),
  stacks: z.record(IdSchema, StackSchema),
  dockerNetworks: z.record(IdSchema, DockerNetworkSchema),
  apps: z.record(IdSchema, AppInstanceSchema),
  vlans: z.record(IdSchema, VlanSchema),
  subnets: z.record(IdSchema, SubnetSchema),
  zones: z.record(IdSchema, ZoneSchema),
  routes: z.record(IdSchema, RouteSchema),
  tags: z.record(IdSchema, TagSchema),
  assertions: z.record(IdSchema, AssertionSchema),
  locations: z.record(IdSchema, LocationSchema),

  layout: LayoutSchema,
});

export const SnapshotSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  createdAt: IsoDateSchema,
  project: ProjectSchema.omit({ id: true }),
});

export const PROJECT_FILE_FORMAT = 'server-planner/project';

export const ProjectFileSchema = z.object({
  format: z.literal(PROJECT_FILE_FORMAT),
  schemaVersion: z.literal(1),
  appVersion: z.string(),
  exportedAt: IsoDateSchema,
  project: ProjectSchema,
  snapshots: z.array(SnapshotSchema).optional(),
});

export type Tag = z.infer<typeof TagSchema>;
export type Assertion = z.infer<typeof AssertionSchema>;
export type NodeLayout = z.infer<typeof NodeLayoutSchema>;
export type Note = z.infer<typeof NoteSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type ProjectFile = z.infer<typeof ProjectFileSchema>;
