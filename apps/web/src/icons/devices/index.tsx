import type { ClientType, Device } from '@server-planner/model';
import {
  Cctv,
  Cpu,
  Gamepad2,
  Globe,
  Laptop,
  type LucideIcon,
  Monitor,
  Printer,
  Smartphone,
  Tv,
} from 'lucide-react';

/** Device silhouettes — docs/04 § 5: 24×24 grid, stroke 1.6, round caps, no fills, currentColor. */

export type SilhouetteName =
  | 'rack-1u'
  | 'rack-2u'
  | 'tower'
  | 'mini-pc'
  | 'desktop'
  | 'nas'
  | 'wall'
  | 'ceiling'
  | 'sbc'
  | 'rack'
  | 'shelf'
  | 'room';

const PATHS: Record<SilhouetteName, string[]> = {
  'rack-1u': [
    'M2 8h20a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z',
    'M4 12h.01',
    'M20 12h.01',
    'M8 12h8',
  ],
  'rack-2u': [
    'M2 5h20a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
    'M1 12h22',
    'M4 8.5h.01',
    'M4 15.5h.01',
  ],
  tower: [
    'M8.5 2h7A1.5 1.5 0 0 1 17 3.5v16a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5v-16A1.5 1.5 0 0 1 8.5 2z',
    'M10 6h4',
    'M12 17h.01',
  ],
  'mini-pc': [
    'M4.5 9h15A1.5 1.5 0 0 1 21 10.5v4a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 14.5v-4A1.5 1.5 0 0 1 4.5 9z',
    'M6 12.5h.01',
    'M5 19h3',
    'M16 19h3',
  ],
  desktop: [
    'M3.5 7h17A1.5 1.5 0 0 1 22 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 15.5v-7A1.5 1.5 0 0 1 3.5 7z',
    'M5 12h6',
    'M18 12h.01',
  ],
  nas: [
    'M4.5 4h15A1.5 1.5 0 0 1 21 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-13A1.5 1.5 0 0 1 4.5 4z',
    'M7.5 7v10',
    'M12 7v10',
    'M16.5 7v10',
  ],
  wall: [
    'M5.5 3h13A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3z',
    'M8 7h8',
    'M8 11h8',
  ],
  ceiling: ['M3 13a9 5 0 1 0 18 0a9 5 0 1 0-18 0', 'M12 13h.01', 'M8 5.5a6 6 0 0 1 8 0'],
  sbc: ['M8 3h8a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z', 'M12 17h.01'],
  rack: [
    'M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
    'M7 6h10',
    'M7 10h10',
    'M7 14h10',
    'M7 18h10',
  ],
  shelf: ['M2 16h20', 'M5 16v4', 'M19 16v4', 'M5 10h7v6H5z'],
  room: ['M3 10l9-7 9 7v11H3z'],
};

export function Silhouette({ name, size = 22 }: { name: SilhouetteName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const CLIENT_ICONS: Record<ClientType, LucideIcon> = {
  pc: Monitor,
  laptop: Laptop,
  phone: Smartphone,
  tv: Tv,
  console: Gamepad2,
  iot: Cpu,
  camera: Cctv,
  printer: Printer,
  other: Monitor,
};

/** Icon for a device according to its kind, client type and form factor. */
export function DeviceIcon({
  device,
  size = 22,
}: {
  device: Pick<Device, 'kind' | 'clientType' | 'formFactor'>;
  size?: number;
}) {
  if (device.kind === 'internet') return <Globe size={size} strokeWidth={1.6} aria-hidden="true" />;
  if (device.kind === 'client') {
    const Icon = CLIENT_ICONS[device.clientType ?? 'other'];
    return <Icon size={size} strokeWidth={1.6} aria-hidden="true" />;
  }
  const ff = device.formFactor;
  if (ff?.mount === 'rack')
    return <Silhouette name={ff.units > 1 ? 'rack-2u' : 'rack-1u'} size={size} />;
  return <Silhouette name={ff?.shape === 'other' || !ff ? 'desktop' : ff.shape} size={size} />;
}
