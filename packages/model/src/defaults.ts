import type { DeviceKind } from './schema/device';
import type { FormFactor } from './schema/location';
import type { InterfaceKind } from './schema/network';
import type { Layout, ProjectSettings } from './schema/project';

/** Defaults used by factories and migrations — docs/02 § 4.3, docs/04 § 5. */

/** Default form factor per device kind (D9). `undefined` = no physical form (Internet node). */
export const DEFAULT_FORM_FACTOR: Record<DeviceKind, FormFactor | undefined> = {
  internet: undefined,
  modem: { mount: 'standalone', shape: 'wall' },
  router: { mount: 'rack', units: 1, width: '19in' },
  firewall: { mount: 'rack', units: 1, width: '19in' },
  switch: { mount: 'rack', units: 1, width: '19in' },
  'access-point': { mount: 'standalone', shape: 'ceiling' },
  server: { mount: 'standalone', shape: 'tower' },
  'mini-pc': { mount: 'standalone', shape: 'mini-pc' },
  sbc: { mount: 'standalone', shape: 'sbc' },
  nas: { mount: 'standalone', shape: 'nas' },
  ups: { mount: 'rack', units: 2, width: '19in' },
  'patch-panel': { mount: 'rack', units: 1, width: '19in' },
  client: { mount: 'standalone', shape: 'other' },
};

export interface PortTemplate {
  name: string;
  kind: InterfaceKind;
  speedMbps?: number;
  poe?: { role: 'pd' | 'pse'; standard?: 'af' | 'at' | 'bt' };
}

const rj45 = (name: string, speedMbps = 1000): PortTemplate => ({ name, kind: 'rj45', speedMbps });
const range = (count: number, make: (n: number) => PortTemplate) =>
  Array.from({ length: count }, (_, i) => make(i + 1));

/** Default physical ports of a generic device of each kind (LIB-01). Catalog models override these. */
export const DEFAULT_PORTS: Record<DeviceKind, PortTemplate[]> = {
  internet: [{ name: 'wan', kind: 'wan' }],
  modem: [{ name: 'wan', kind: 'wan', speedMbps: 1000 }, rj45('lan1')],
  router: [{ name: 'wan0', kind: 'wan', speedMbps: 1000 }, ...range(3, (n) => rj45(`lan${n - 1}`))],
  firewall: [
    { name: 'wan0', kind: 'wan', speedMbps: 1000 },
    ...range(3, (n) => rj45(`lan${n - 1}`)),
  ],
  switch: range(8, (n) => rj45(`Port ${n}`)),
  'access-point': [
    { name: 'eth0', kind: 'rj45', speedMbps: 1000, poe: { role: 'pd', standard: 'at' } },
    { name: 'wlan0', kind: 'wifi-radio' },
  ],
  server: [rj45('eth0'), rj45('eth1')],
  'mini-pc': [rj45('eth0')],
  sbc: [rj45('eth0')],
  nas: [rj45('eth0'), rj45('eth1')],
  ups: [],
  'patch-panel': range(12, (n) => ({ name: `Port ${n}`, kind: 'rj45' })),
  client: [rj45('eth0'), { name: 'wlan0', kind: 'wifi-radio' }],
};

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  capacityThresholds: { warning: 0.7, critical: 0.9 },
  defaultOvercommit: { cpu: 4, memory: 1 },
  storageFreeReserve: 0.1,
  currency: 'EUR',
};

export const emptyLayout = (): Layout => ({
  nodes: {},
  links: {},
  locations: {},
  groupByLocation: true,
  notes: {},
});

/** Interface kinds that accept at most one link (a physical socket or a vNIC). */
export const SINGLE_LINK_KINDS: readonly InterfaceKind[] = [
  'rj45',
  'sfp',
  'sfp+',
  'sfp28',
  'qsfp+',
  'wan',
  'vnic',
];

/** Interface kinds that only exist virtually (links between them are not drawn on the canvas). */
export const VIRTUAL_KINDS: readonly InterfaceKind[] = ['bridge', 'vnic', 'vlan', 'bond'];
