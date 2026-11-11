import { z } from 'zod';
import {
  CidrSchema,
  ColorRefSchema,
  HexColorSchema,
  IdSchema,
  IpAddressSchema,
  MbpsSchema,
  PortRangeSchema,
  PortSchema,
  ProtocolSchema,
  TransportSchema,
  WattsSchema,
} from './common';

/** Network — docs/02-model-danych.md § 6. */

export const INTERFACE_KINDS = [
  'rj45',
  'sfp',
  'sfp+',
  'sfp28',
  'qsfp+',
  'wifi-radio',
  'wan',
  'bridge',
  'vlan',
  'vnic',
  'bond',
] as const;
export const InterfaceKindSchema = z.enum(INTERFACE_KINDS);

export const SwitchportSchema = z.object({
  mode: z.enum(['access', 'trunk']),
  accessVlanId: IdSchema.optional(),
  nativeVlanId: IdSchema.optional(),
  allowedVlanIds: z.union([z.array(IdSchema), z.literal('all')]).optional(),
});

export const IpAssignmentSchema = z.object({
  mode: z.enum(['static', 'dhcp', 'dhcp-reservation']),
  address: IpAddressSchema.optional(),
  subnetId: IdSchema.optional(),
});

export const PoeSchema = z.object({
  role: z.enum(['pd', 'pse']),
  standard: z.enum(['af', 'at', 'bt']).optional(),
  drawW: WattsSchema.optional(),
});

export const InterfaceSchema = z.object({
  id: IdSchema,
  owner: z.object({ type: z.enum(['device', 'workload']), id: IdSchema }),
  name: z.string().min(1),
  kind: InterfaceKindSchema,
  index: z.number().int().nonnegative().optional(),
  speedMbps: MbpsSchema.optional(),
  poe: PoeSchema.optional(),
  mac: z.string().optional(),
  /** vlan → parent interface; physical port → bridge it belongs to. */
  parentId: IdSchema.optional(),
  vlanTag: z.number().int().min(1).max(4094).optional(),
  switchport: SwitchportSchema.optional(),
  addresses: z.array(IpAssignmentSchema),
  zoneId: IdSchema.optional(),
  enabled: z.boolean(),
});

export const LinkSchema = z.object({
  id: IdSchema,
  a: IdSchema,
  b: IdSchema,
  medium: z.enum(['copper', 'fiber', 'dac', 'wifi', 'virtual']),
  cable: z
    .object({
      label: z.string().optional(),
      color: HexColorSchema.optional(),
      lengthM: z.number().positive().optional(),
      category: z.enum(['cat5e', 'cat6', 'cat6a', 'om3', 'os2']).optional(),
    })
    .optional(),
  ssidId: z.string().optional(),
  tagIds: z.array(IdSchema),
});

export const SwitchCapabilitiesSchema = z.object({
  layer: z.union([z.literal(2), z.literal(3)]),
  managed: z.boolean(),
  poeBudgetW: WattsSchema.optional(),
});

export const SsidSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  vlanId: IdSchema.optional(),
  bands: z.array(z.enum(['2.4', '5', '6'])),
  clientIsolation: z.boolean(),
  security: z.enum(['open', 'wpa2', 'wpa3']),
});
export const WifiConfigSchema = z.object({ ssids: z.array(SsidSchema) });

export const VlanSchema = z.object({
  id: IdSchema,
  vid: z.number().int().min(1).max(4094),
  name: z.string().min(1),
  color: ColorRefSchema,
  description: z.string().optional(),
});

export const SubnetSchema = z.object({
  id: IdSchema,
  cidr: CidrSchema,
  vlanId: IdSchema.optional(),
  zoneId: IdSchema.optional(),
  gateway: IpAddressSchema.optional(),
  dhcp: z
    .object({
      enabled: z.boolean(),
      rangeStart: IpAddressSchema,
      rangeEnd: IpAddressSchema,
      serverRef: z.object({ type: z.enum(['device', 'app']), id: IdSchema }).optional(),
    })
    .optional(),
  dns: z
    .object({
      servers: z.array(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('ip'), value: IpAddressSchema }),
          z.object({ type: z.literal('app'), id: IdSchema }),
        ]),
      ),
      domain: z.string().optional(),
    })
    .optional(),
  name: z.string().optional(),
});

export const ZoneSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  kind: z.enum(['wan', 'internal']),
  color: ColorRefSchema,
  intraZone: z.enum(['allow', 'deny']),
});

export const EndpointSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('any') }),
  z.object({ type: z.literal('internet') }),
  z.object({ type: z.literal('zone'), id: IdSchema }),
  z.object({ type: z.literal('subnet'), id: IdSchema }),
  z.object({ type: z.literal('device'), id: IdSchema }),
  z.object({ type: z.literal('workload'), id: IdSchema }),
  z.object({ type: z.literal('app'), id: IdSchema }),
  z.object({ type: z.literal('cidr'), value: CidrSchema }),
]);

export const FirewallRuleSchema = z.object({
  id: IdSchema,
  enabled: z.boolean(),
  action: z.enum(['allow', 'deny']),
  protocol: ProtocolSchema,
  source: EndpointSchema,
  destination: EndpointSchema,
  ports: z.array(PortRangeSchema).optional(),
  description: z.string().optional(),
  log: z.boolean().optional(),
});

export const NatRuleSchema = z.discriminatedUnion('kind', [
  z.object({
    id: IdSchema,
    kind: z.literal('masquerade'),
    outInterfaceId: IdSchema,
    sourceZoneIds: z.array(IdSchema).optional(),
  }),
  z.object({
    id: IdSchema,
    kind: z.literal('port-forward'),
    inInterfaceId: IdSchema,
    protocol: TransportSchema,
    externalPort: PortSchema,
    target: z.union([
      z.object({ appId: IdSchema, port: PortSchema }),
      z.object({ ip: IpAddressSchema, port: PortSchema }),
    ]),
  }),
]);

export const FirewallSchema = z.object({
  defaultAction: z.enum(['allow', 'deny']),
  /** Order = priority (first match wins). */
  rules: z.array(FirewallRuleSchema),
  nat: z.array(NatRuleSchema),
  stateful: z.literal(true),
});

export const RouteSchema = z.object({
  id: IdSchema,
  deviceId: IdSchema,
  destination: CidrSchema,
  via: IpAddressSchema.optional(),
  interfaceId: IdSchema.optional(),
});

export type InterfaceKind = z.infer<typeof InterfaceKindSchema>;
export type Switchport = z.infer<typeof SwitchportSchema>;
export type IpAssignment = z.infer<typeof IpAssignmentSchema>;
export type Interface = z.infer<typeof InterfaceSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type LinkMedium = Link['medium'];
export type SwitchCapabilities = z.infer<typeof SwitchCapabilitiesSchema>;
export type Ssid = z.infer<typeof SsidSchema>;
export type WifiConfig = z.infer<typeof WifiConfigSchema>;
export type Vlan = z.infer<typeof VlanSchema>;
export type Subnet = z.infer<typeof SubnetSchema>;
export type Zone = z.infer<typeof ZoneSchema>;
export type Endpoint = z.infer<typeof EndpointSchema>;
export type FirewallRule = z.infer<typeof FirewallRuleSchema>;
export type NatRule = z.infer<typeof NatRuleSchema>;
export type Firewall = z.infer<typeof FirewallSchema>;
export type Route = z.infer<typeof RouteSchema>;
