import { z } from 'zod';
import {
  BytesSchema,
  ConfidenceSchema,
  IsoDateSchema,
  LocalizedTextSchema,
  MbpsSchema,
  PortSchema,
  ResourcesSchema,
  TransportSchema,
} from './common';
import { DeviceKindSchema } from './device';
import { CpuSpecSchema, DiskSchema, GpuSpecSchema, MemorySpecSchema, OsIdSchema } from './hardware';
import { FormFactorSchema } from './location';
import { InterfaceKindSchema, PoeSchema, SwitchCapabilitiesSchema } from './network';
import {
  ListenerSchema,
  PeerSelectorSchema,
  PortMappingSchema,
  TrafficPatternSchema,
} from './workload';

/**
 * Catalog — docs/02-model-danych.md § 9. Normalised form (sizes in bytes, CPU references
 * resolved), produced by `packages/catalog-builder` from `catalog/curated/*.yaml`.
 */

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Expected a lowercase slug');
const HttpsUrlSchema = z.url({ protocol: /^https$/ });
const SourcesSchema = z.array(z.string().min(1)).min(1);

export const APP_ROLES = ['app', 'database', 'cache', 'worker', 'proxy', 'dns', 'other'] as const;

export const CatalogAppComponentSchema = z.object({
  key: SlugSchema,
  name: z.string().min(1),
  role: z.enum(APP_ROLES),
  image: z.string().min(1),
  defaultTag: z.string().min(1),
  arch: z.array(z.enum(['amd64', 'arm64'])).min(1),
  platform: z.enum(['linux', 'windows']),
  listeners: z.array(ListenerSchema),
  defaultPortMappings: z.array(PortMappingSchema).optional(),
  volumes: z.array(
    z.object({
      name: z.string().min(1),
      containerPath: z.string().min(1),
      purpose: z.enum(['config', 'data', 'media', 'cache']),
      defaultSizeBytes: BytesSchema.optional(),
    }),
  ),
  requirements: z.object({ min: ResourcesSchema, recommended: ResourcesSchema }).optional(),
});

export const CatalogLoadProfileSchema = z.object({
  id: z.string().min(1),
  name: LocalizedTextSchema,
  params: z
    .array(
      z.object({
        key: z.string().min(1),
        name: LocalizedTextSchema,
        default: z.number(),
        min: z.number(),
        max: z.number(),
      }),
    )
    .optional(),
  resources: ResourcesSchema,
  perParam: z.record(z.string(), ResourcesSchema.partial()).optional(),
});

export const CatalogFlowSchema = z.object({
  id: z.string().min(1),
  name: LocalizedTextSchema,
  description: LocalizedTextSchema.optional(),
  roles: z
    .array(
      z.object({
        key: z.string().min(1),
        name: LocalizedTextSchema,
        selector: z.union([PeerSelectorSchema, z.object({ kind: z.literal('self') })]),
        userPicks: z.boolean(),
      }),
    )
    .min(2),
  steps: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        protocol: TransportSchema,
        port: PortSchema.optional(),
        purpose: z.string().optional(),
        resolveDns: z.boolean().optional(),
        bandwidthMbps: MbpsSchema.optional(),
        optional: z.boolean().optional(),
      }),
    )
    .min(1),
});

export const CatalogAppSchema = z
  .object({
    id: SlugSchema,
    name: z.string().min(1),
    description: LocalizedTextSchema,
    categories: z.array(SlugSchema).min(1),
    website: HttpsUrlSchema.optional(),
    repository: HttpsUrlSchema.optional(),
    license: z.string().optional(),
    logo: z.string().optional(),
    popularity: z.number().nonnegative().optional(),
    source: SourcesSchema,
    confidence: ConfidenceSchema,
    deployment: z.object({
      kind: z.enum(['single', 'stack']),
      components: z.array(CatalogAppComponentSchema).min(1),
      native: z
        .object({ os: z.array(OsIdSchema), notes: LocalizedTextSchema.optional() })
        .optional(),
    }),
    requirements: z.object({ min: ResourcesSchema, recommended: ResourcesSchema }),
    loadProfiles: z.array(CatalogLoadProfileSchema).optional(),
    dependencies: z.array(
      z.object({
        capability: z.string().min(1),
        optional: z.boolean(),
        providedByComponent: z.string().optional(),
      }),
    ),
    provides: z.array(z.string().min(1)).optional(),
    trafficPatterns: z.array(TrafficPatternSchema),
    flows: z.array(CatalogFlowSchema),
  })
  .superRefine((app, ctx) => {
    const keys = app.deployment.components.map((c) => c.key);
    if (app.deployment.kind === 'single' && keys.length !== 1)
      ctx.addIssue({ code: 'custom', message: 'A single deployment has exactly one component' });
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: 'custom', message: 'Component keys must be unique' });
    for (const dep of app.dependencies) {
      if (dep.providedByComponent && !keys.includes(dep.providedByComponent))
        ctx.addIssue({
          code: 'custom',
          message: `Dependency ${dep.capability} names unknown component ${dep.providedByComponent}`,
        });
    }
    const unique = (ids: string[], what: string) => {
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: 'custom', message: `${what} ids must be unique` });
    };
    unique(
      app.trafficPatterns.map((p) => p.id),
      'Traffic pattern',
    );
    unique(
      app.flows.map((f) => f.id),
      'Flow',
    );
    for (const p of app.trafficPatterns) {
      if (p.peer.kind === 'self-component' && !keys.includes(p.peer.key))
        ctx.addIssue({
          code: 'custom',
          message: `Pattern ${p.id} names unknown component ${p.peer.key}`,
        });
    }
    for (const flow of app.flows) {
      const roles = new Set(flow.roles.map((r) => r.key));
      for (const step of flow.steps) {
        if (!roles.has(step.from) || !roles.has(step.to))
          ctx.addIssue({ code: 'custom', message: `Flow ${flow.id} step uses an unknown role` });
      }
    }
  });

export const CatalogCpuSchema = CpuSpecSchema.omit({ catalogRef: true }).extend({
  id: SlugSchema,
  vendor: z.enum(['intel', 'amd', 'arm', 'other']),
  source: SourcesSchema,
  confidence: ConfidenceSchema,
});

export const CatalogDeviceSchema = z.object({
  id: SlugSchema,
  kind: DeviceKindSchema,
  vendor: z.string().min(1),
  model: z.string().min(1),
  hardware: z.object({
    cpus: z.array(CpuSpecSchema),
    memory: MemorySpecSchema.optional(),
    gpus: z.array(GpuSpecSchema),
    power: z
      .object({ idleW: z.number().nonnegative(), loadW: z.number().nonnegative() })
      .optional(),
    defaultDisks: z.array(DiskSchema.omit({ id: true })).optional(),
  }),
  formFactor: FormFactorSchema,
  ports: z
    .array(
      z.object({
        name: z.string().min(1),
        kind: InterfaceKindSchema,
        speedMbps: MbpsSchema.optional(),
        poe: PoeSchema.optional(),
      }),
    )
    .min(1),
  switching: SwitchCapabilitiesSchema.optional(),
  expansion: z
    .object({
      pcieSlots: z.number().int().nonnegative().optional(),
      m2Slots: z.number().int().nonnegative().optional(),
      sataBays: z.number().int().nonnegative().optional(),
    })
    .optional(),
  source: SourcesSchema,
  confidence: ConfidenceSchema,
});

export const CatalogOsSchema = z.object({
  id: OsIdSchema,
  name: z.string().min(1),
  versions: z
    .array(
      z.object({
        version: z.string().min(1),
        releasedAt: z.iso.date().optional(),
        eol: z.iso.date().optional(),
      }),
    )
    .min(1),
  role: z.enum(['hypervisor', 'server']),
  overhead: ResourcesSchema,
  arch: z.array(z.enum(['amd64', 'arm64'])).min(1),
  capabilities: z.object({
    vm: z.boolean(),
    lxc: z.boolean(),
    docker: z.enum(['native', 'discouraged', 'windows-containers-only', 'unsupported']),
  }),
  defaultInterfaces: z.array(z.object({ name: z.string(), kind: InterfaceKindSchema })).optional(),
});

/** The effective catalog the app works with (base layer, later + downloaded updates). */
export const CatalogSchema = z.object({
  format: z.literal('server-planner/catalog'),
  catalogVersion: z.string().min(1),
  generatedAt: IsoDateSchema,
  apps: z.array(CatalogAppSchema),
  devices: z.array(CatalogDeviceSchema),
  cpus: z.array(CatalogCpuSchema),
  os: z.array(CatalogOsSchema),
});

export type CatalogAppComponent = z.infer<typeof CatalogAppComponentSchema>;
export type CatalogLoadProfile = z.infer<typeof CatalogLoadProfileSchema>;
export type CatalogFlow = z.infer<typeof CatalogFlowSchema>;
export type CatalogApp = z.infer<typeof CatalogAppSchema>;
export type CatalogCpu = z.infer<typeof CatalogCpuSchema>;
export type CatalogDevice = z.infer<typeof CatalogDeviceSchema>;
export type CatalogOs = z.infer<typeof CatalogOsSchema>;
export type Catalog = z.infer<typeof CatalogSchema>;
