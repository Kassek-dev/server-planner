import type { Link } from './schema/network';
import type { Project } from './schema/project';

/**
 * LBL-03 cable labels from a pattern, e.g. `SW1-P05 ↔ PVE1-ETH0`. Tokens: `{a.device}`,
 * `{a.port}`, `{b.device}`, `{b.port}`; ends are ordered by device name so a label is stable.
 */

/** Starting value of the cable color picker (a neutral grey cable). */
export const DEFAULT_CABLE_COLOR = '#808080';

export const DEFAULT_CABLE_PATTERN = '{a.device}-{a.port} ↔ {b.device}-{b.port}';

/** "Port 5" → "P05", "eth0" → "ETH0", "lan0.20" → "LAN0.20". */
export function shortPort(name: string): string {
  const port = /^port\s*(\d+)$/i.exec(name.trim());
  if (port?.[1]) return `P${port[1].padStart(2, '0')}`;
  return name.trim().replace(/\s+/g, '').toUpperCase();
}

const shortDevice = (name: string) => name.trim().replace(/\s+/g, '-').toUpperCase();

export function cableLabel(
  project: Project,
  link: Link,
  pattern: string = DEFAULT_CABLE_PATTERN,
): string {
  const end = (id: string) => {
    const iface = project.interfaces[id];
    const owner =
      iface?.owner.type === 'device'
        ? project.devices[iface.owner.id]?.name
        : iface
          ? project.workloads[iface.owner.id]?.name
          : undefined;
    return { device: shortDevice(owner ?? '?'), port: shortPort(iface?.name ?? '?') };
  };
  const [a, b] = [end(link.a), end(link.b)].sort((x, y) => x.device.localeCompare(y.device)) as [
    { device: string; port: string },
    { device: string; port: string },
  ];
  return pattern
    .replaceAll('{a.device}', a.device)
    .replaceAll('{a.port}', a.port)
    .replaceAll('{b.device}', b.device)
    .replaceAll('{b.port}', b.port);
}
