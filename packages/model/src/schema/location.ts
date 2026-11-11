import { z } from 'zod';
import { IdSchema, WattsSchema } from './common';

/** Form factor and physical locations (D9) — docs/02-model-danych.md § 4.3. */

export const RACK_WIDTHS = ['10in', '19in'] as const;
export const STANDALONE_SHAPES = [
  'tower',
  'mini-pc',
  'desktop',
  'nas',
  'wall',
  'ceiling',
  'sbc',
  'other',
] as const;

export const FormFactorSchema = z.discriminatedUnion('mount', [
  z.object({
    mount: z.literal('rack'),
    units: z.number().int().min(1).max(8),
    width: z.enum(RACK_WIDTHS),
  }),
  z.object({ mount: z.literal('standalone'), shape: z.enum(STANDALONE_SHAPES) }),
]);

export const PlacementSchema = z.object({
  locationId: IdSchema,
  /** Rack only: lowest occupied unit (1 = bottom of the rack). */
  u: z.number().int().min(1).optional(),
  /** Standalone device standing on a rack shelf. */
  onShelf: z.boolean().optional(),
});

const LocationBase = {
  id: IdSchema,
  name: z.string().min(1),
  /** LOC-07: rack or shelf inside a room (max depth 2). */
  parentId: IdSchema.optional(),
  description: z.string().optional(),
};

export const RACK_UNITS_MIN = 6;
export const RACK_UNITS_MAX = 42;

export const LocationSchema = z.discriminatedUnion('kind', [
  z.object({ ...LocationBase, kind: z.literal('room') }),
  z.object({ ...LocationBase, kind: z.literal('shelf') }),
  z.object({
    ...LocationBase,
    kind: z.literal('rack'),
    units: z.number().int().min(RACK_UNITS_MIN).max(RACK_UNITS_MAX),
    width: z.enum(RACK_WIDTHS),
    depthMm: z.number().int().positive().optional(),
    shelves: z
      .array(z.object({ u: z.number().int().min(1), units: z.number().int().min(1) }))
      .optional(),
    powerBudgetW: WattsSchema.optional(),
  }),
]);

export type FormFactor = z.infer<typeof FormFactorSchema>;
export type RackWidth = (typeof RACK_WIDTHS)[number];
export type StandaloneShape = (typeof STANDALONE_SHAPES)[number];
export type Placement = z.infer<typeof PlacementSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type LocationKind = Location['kind'];
export type Rack = Extract<Location, { kind: 'rack' }>;
