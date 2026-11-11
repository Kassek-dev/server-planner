import ipaddr from 'ipaddr.js';
import { z } from 'zod';

/** Shared primitives — docs/02-model-danych.md § 1 (Typy pomocnicze). Base units per Z5. */

export const IdSchema = z.string().regex(/^[a-z]+_[A-Za-z0-9-]+$/, 'Invalid id');
export const IsoDateSchema = z.iso.datetime({ offset: true });

export const BytesSchema = z.number().int().nonnegative();
export const MbpsSchema = z.number().nonnegative();
export const WattsSchema = z.number().nonnegative();
export const CoresSchema = z.number().nonnegative();

export const IpAddressSchema = z.string().refine((v) => ipaddr.isValid(v), 'Invalid IP address');
export const CidrSchema = z.string().refine((v) => {
  try {
    ipaddr.parseCIDR(v);
    return true;
  } catch {
    return false;
  }
}, 'Invalid CIDR');

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color');
export const PALETTE_KEYS = [
  'violet',
  'sky',
  'teal',
  'pink',
  'indigo',
  'sand',
  'lime',
  'cyan',
] as const;
export const PaletteKeySchema = z.enum(PALETTE_KEYS);
/** Palette key (follows the theme, docs/04 § 2.4) or a custom hex color. */
export const ColorRefSchema = z.union([PaletteKeySchema, HexColorSchema]);

export const LocalizedTextSchema = z.object({ en: z.string() }).catchall(z.string());

export const ProtocolSchema = z.enum(['tcp', 'udp', 'icmp', 'any']);
export const TransportSchema = z.enum(['tcp', 'udp']);
export const PortSchema = z.number().int().min(1).max(65535);
export const PortRangeSchema = z
  .object({ from: PortSchema, to: PortSchema })
  .refine((r) => r.from <= r.to, 'Port range start must not exceed its end');

export const CatalogRefSchema = z.object({ id: z.string(), version: z.string() });
export const ConfidenceSchema = z.enum(['curated', 'imported', 'estimated']);

export const GpuFeatureSchema = z.enum(['quicksync', 'nvenc', 'vcn', 'cuda', 'rocm', 'tpu', 'npu']);

export const ResourcesSchema = z.object({
  cpu: CoresSchema,
  memoryBytes: BytesSchema,
  diskBytes: BytesSchema,
  gpu: z.object({ required: z.boolean(), features: z.array(GpuFeatureSchema) }).optional(),
});

export type Id = z.infer<typeof IdSchema>;
export type IsoDate = z.infer<typeof IsoDateSchema>;
export type Bytes = number;
export type Mbps = number;
export type Watts = number;
export type Cores = number;
export type IpAddress = string;
export type Cidr = string;
export type HexColor = string;
export type PaletteKey = z.infer<typeof PaletteKeySchema>;
export type ColorRef = z.infer<typeof ColorRefSchema>;
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;
export type Protocol = z.infer<typeof ProtocolSchema>;
export type Transport = z.infer<typeof TransportSchema>;
export type PortRange = z.infer<typeof PortRangeSchema>;
export type CatalogRef = z.infer<typeof CatalogRefSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type GpuFeature = z.infer<typeof GpuFeatureSchema>;
export type Resources = z.infer<typeof ResourcesSchema>;
