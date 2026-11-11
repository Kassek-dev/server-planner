import { z } from 'zod';
import {
  BytesSchema,
  CatalogRefSchema,
  CidrSchema,
  ConfidenceSchema,
  CoresSchema,
  IdSchema,
  IpAddressSchema,
  PortSchema,
  ResourcesSchema,
  TransportSchema,
} from './common';
import { OsInstallSchema } from './hardware';

/** Workloads, Docker and apps — docs/02-model-danych.md § 5, traffic patterns § 9.3. */

export const HostRefSchema = z.object({ type: z.enum(['device', 'workload']), id: IdSchema });

export const AllocatedResourcesSchema = z.object({
  cpu: CoresSchema,
  memoryBytes: BytesSchema,
  disks: z.array(
    z.object({ poolId: IdSchema, sizeBytes: BytesSchema, name: z.string().optional() }),
  ),
});

export const PortMappingSchema = z.object({
  hostPort: PortSchema,
  containerPort: PortSchema,
  protocol: TransportSchema,
  hostIp: IpAddressSchema.optional(),
});

export const VolumeSchema = z.object({
  name: z.string().min(1),
  containerPath: z.string().min(1),
  type: z.enum(['named', 'bind', 'nfs', 'smb']),
  poolId: IdSchema.optional(),
  remote: z
    .object({
      appId: IdSchema.optional(),
      deviceId: IdSchema.optional(),
      path: z.string().optional(),
    })
    .optional(),
  sizeBytes: BytesSchema.optional(),
  growthBytesPerMonth: BytesSchema.optional(),
});

export const DockerRuntimeSchema = z.object({
  enabled: z.literal(true),
  networkIds: z.array(IdSchema),
});

const WorkloadBase = {
  id: IdSchema,
  name: z.string().min(1),
  host: HostRefSchema,
  tagIds: z.array(IdSchema),
  description: z.string().optional(),
  autostart: z.boolean().optional(),
};

export const WorkloadSchema = z.discriminatedUnion('kind', [
  z.object({
    ...WorkloadBase,
    kind: z.literal('vm'),
    vmid: z.number().int().positive().optional(),
    resources: AllocatedResourcesSchema,
    guestOs: OsInstallSchema,
    docker: DockerRuntimeSchema.optional(),
    passthrough: z
      .object({ gpu: z.boolean().optional(), pciDevices: z.array(z.string()).optional() })
      .optional(),
  }),
  z.object({
    ...WorkloadBase,
    kind: z.literal('lxc'),
    vmid: z.number().int().positive().optional(),
    resources: AllocatedResourcesSchema,
    template: z.string().min(1),
    unprivileged: z.boolean(),
    docker: DockerRuntimeSchema.optional(),
  }),
  z.object({
    ...WorkloadBase,
    kind: z.literal('container'),
    stackId: IdSchema.optional(),
    image: z.string().min(1),
    tag: z.string().min(1),
    network: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('host') }),
      z.object({ mode: z.literal('none') }),
      z.object({
        mode: z.literal('docker-network'),
        dockerNetworkId: IdSchema,
        ip: IpAddressSchema.optional(),
      }),
    ]),
    portMappings: z.array(PortMappingSchema),
    volumes: z.array(VolumeSchema),
    limits: z
      .object({ cpu: CoresSchema.optional(), memoryBytes: BytesSchema.optional() })
      .optional(),
    gpu: z.boolean().optional(),
    catalogRef: CatalogRefSchema.optional(),
  }),
]);

export const DockerNetworkSchema = z.object({
  id: IdSchema,
  host: HostRefSchema,
  name: z.string().min(1),
  driver: z.enum(['bridge', 'macvlan', 'ipvlan']),
  subnet: CidrSchema.optional(),
  parentInterfaceId: IdSchema.optional(),
  internal: z.boolean().optional(),
});

export const StackSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  host: HostRefSchema,
  catalogRef: CatalogRefSchema.optional(),
});

export const PeerSelectorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('lan-clients') }),
  z.object({ kind: z.literal('internet') }),
  z.object({ kind: z.literal('dns') }),
  z.object({ kind: z.literal('dependency'), capability: z.string().min(1) }),
  z.object({
    kind: z.literal('device-kind'),
    deviceKind: z.string().min(1),
    clientType: z.string().optional(),
  }),
  z.object({ kind: z.literal('self-component'), key: z.string().min(1) }),
]);

export const TrafficPatternSchema = z.object({
  id: z.string().min(1),
  direction: z.enum(['inbound', 'outbound']),
  peer: PeerSelectorSchema,
  protocol: TransportSchema,
  port: PortSchema.optional(),
  purpose: z.string().min(1),
  required: z.boolean(),
  bandwidth: z
    .object({ typicalMbps: z.number().nonnegative(), peakMbps: z.number().nonnegative() })
    .optional(),
});

export const ListenerSchema = z.object({
  port: PortSchema,
  protocol: TransportSchema,
  purpose: z.string().optional(),
});

export const AppInstanceSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  runsOn: HostRefSchema,
  catalogRef: CatalogRefSchema.optional(),
  role: z.enum(['app', 'database', 'cache', 'worker', 'proxy', 'dns', 'other']).optional(),
  tagIds: z.array(IdSchema),
  listeners: z.array(ListenerSchema),
  requirements: z.object({ min: ResourcesSchema, recommended: ResourcesSchema }),
  loadProfile: z
    .object({ profileId: z.string(), params: z.record(z.string(), z.number()).optional() })
    .optional(),
  dependencies: z.array(
    z.object({
      capability: z.string().min(1),
      satisfiedBy: IdSchema.optional(),
      optional: z.boolean(),
    }),
  ),
  trafficPatterns: z.array(TrafficPatternSchema),
  confidence: ConfidenceSchema,
});

export type HostRef = z.infer<typeof HostRefSchema>;
export type AllocatedResources = z.infer<typeof AllocatedResourcesSchema>;
export type PortMapping = z.infer<typeof PortMappingSchema>;
export type Volume = z.infer<typeof VolumeSchema>;
export type DockerRuntime = z.infer<typeof DockerRuntimeSchema>;
export type Workload = z.infer<typeof WorkloadSchema>;
export type WorkloadKind = Workload['kind'];
export type DockerNetwork = z.infer<typeof DockerNetworkSchema>;
export type Stack = z.infer<typeof StackSchema>;
export type PeerSelector = z.infer<typeof PeerSelectorSchema>;
export type TrafficPattern = z.infer<typeof TrafficPatternSchema>;
export type Listener = z.infer<typeof ListenerSchema>;
export type AppInstance = z.infer<typeof AppInstanceSchema>;
