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
  /** `slaac` (schema v3, NET-17): IPv6 address from router advertisements; `dhcp` on an IPv6 subnet = DHCPv6. */
  mode: z.enum(['static', 'dhcp', 'dhcp-reservation', 'slaac']),
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
  /** NET-16 (schema v4), `bond` interfaces: how the member ports (parentId → bond) work together. */
  bond: z.object({ mode: z.enum(['lacp', 'active-backup', 'balance-alb']) }).optional(),
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
  /**
   * NET-17, IPv6 subnets only: how hosts get addresses from router advertisements — SLAAC,
   * DHCPv6 (managed) or none (static only). Absent = SLAAC.
   */
  ra: z.enum(['slaac', 'dhcpv6', 'none']).optional(),
  name: z.string().optional(),
});

export const ZoneSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  /** `vpn` (schema v4, NET-16): remote clients that come in through a VPN server app. */
  kind: z.enum(['wan', 'internal', 'vpn']),
  color: ColorRefSchema,
  intraZone: z.enum(['allow', 'deny']),
  /** VPN zones: the server app the clients connect to (their traffic starts at its host). */
  vpn: z
    .object({
      serverAppId: IdSchema,
      protocol: z.enum(['wireguard', 'tailscale', 'openvpn']),
      /**
       * 1.10: `full` — clients reach the internet through the lab (the router's WAN); `split` —
       * only lab traffic goes through the tunnel. Absent = full.
       */
      tunnel: z.enum(['full', 'split']).optional(),
    })
    .optional(),
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

/** NET-15 host firewall rule (schema v4): inbound only, matched on the source. */
export const HostFirewallRuleSchema = z.object({
  id: IdSchema,
  enabled: z.boolean(),
  /** 1.10: `out` rules filter what the host sends and match the destination; absent = `in`. */
  direction: z.enum(['in', 'out']).optional(),
  action: z.enum(['allow', 'deny']),
  protocol: ProtocolSchema,
  source: EndpointSchema,
  /** Out rules: where the traffic goes. */
  destination: EndpointSchema.optional(),
  ports: z.array(PortRangeSchema).optional(),
  description: z.string().optional(),
});

/**
 * NET-15 firewall on a host or VM/LXC (Proxmox firewall, ufw, Windows Firewall), simplified:
 * a default for incoming traffic and rules checked in order; outgoing traffic is not filtered.
 */
export const HostFirewallSchema = z.object({
  enabled: z.boolean(),
  inbound: z.enum(['allow', 'deny']),
  /** 1.10: default for traffic the host sends; absent = allow (not filtered). */
  outbound: z.enum(['allow', 'deny']).optional(),
  rules: z.array(HostFirewallRuleSchema),
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

/** DNS names: labels of letters, digits and hyphens, dot-separated (no trailing dot). */
export const HostnameSchema = z
  .string()
  .max(253)
  .regex(
    /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i,
    'Invalid host name',
  );

/** NET-11 reverse proxy route: a host name served by a proxy app and passed to an app port. */
export const ProxyRouteSchema = z.object({
  id: IdSchema,
  hostname: HostnameSchema,
  proxyAppId: IdSchema,
  target: z.object({ appId: IdSchema, port: PortSchema }),
  tls: z.boolean(),
});

/** NET-14 local DNS record, answered by a DNS app (Pi-hole, AdGuard…) when one is set. */
export const DnsRecordSchema = z.discriminatedUnion('type', [
  z.object({
    id: IdSchema,
    type: z.literal('A'),
    name: HostnameSchema,
    value: IpAddressSchema,
    serverAppId: IdSchema.optional(),
  }),
  z.object({
    id: IdSchema,
    type: z.literal('CNAME'),
    name: HostnameSchema,
    value: HostnameSchema,
    serverAppId: IdSchema.optional(),
  }),
]);

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
export type HostFirewallRule = z.infer<typeof HostFirewallRuleSchema>;
export type HostFirewall = z.infer<typeof HostFirewallSchema>;
export type NatRule = z.infer<typeof NatRuleSchema>;
export type Firewall = z.infer<typeof FirewallSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type ProxyRoute = z.infer<typeof ProxyRouteSchema>;
export type DnsRecord = z.infer<typeof DnsRecordSchema>;
