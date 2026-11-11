import type { ClientType, DeviceKind, LocationKind } from '@server-planner/model';

/** Library items (docs/05 § 6.13, LIB-01): generic devices per kind and location containers. */

export type LibraryItem =
  | { type: 'device'; kind: DeviceKind; clientType?: ClientType; meta: string }
  | { type: 'location'; kind: LocationKind; meta: string };

export const LIBRARY: {
  section: 'rack' | 'standalone' | 'clients' | 'locations';
  items: LibraryItem[];
}[] = [
  {
    section: 'rack',
    items: [
      { type: 'device', kind: 'router', meta: '1U' },
      { type: 'device', kind: 'firewall', meta: '1U' },
      { type: 'device', kind: 'switch', meta: '1U' },
      { type: 'device', kind: 'patch-panel', meta: '1U' },
      { type: 'device', kind: 'ups', meta: '2U' },
    ],
  },
  {
    section: 'standalone',
    items: [
      { type: 'device', kind: 'mini-pc', meta: 'tiny' },
      { type: 'device', kind: 'server', meta: 'tower' },
      { type: 'device', kind: 'nas', meta: 'NAS' },
      { type: 'device', kind: 'sbc', meta: 'SBC' },
      { type: 'device', kind: 'access-point', meta: 'PoE' },
      { type: 'device', kind: 'modem', meta: 'WAN' },
      { type: 'device', kind: 'internet', meta: 'WAN' },
    ],
  },
  {
    section: 'clients',
    items: [
      { type: 'device', kind: 'client', clientType: 'laptop', meta: 'Wi‑Fi' },
      { type: 'device', kind: 'client', clientType: 'phone', meta: 'Wi‑Fi' },
      { type: 'device', kind: 'client', clientType: 'tv', meta: 'Wi‑Fi' },
      { type: 'device', kind: 'client', clientType: 'iot', meta: 'Wi‑Fi' },
    ],
  },
  {
    section: 'locations',
    items: [
      { type: 'location', kind: 'room', meta: '' },
      { type: 'location', kind: 'shelf', meta: '' },
      { type: 'location', kind: 'rack', meta: '12U' },
    ],
  },
];

export const DRAG_MIME = 'application/x-server-planner-item';
