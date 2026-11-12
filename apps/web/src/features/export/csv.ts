import type { Catalog, Project } from '@server-planner/model';
import type { AppRow, DeviceRow, WorkloadRow } from '../inventory/rows';
import type { SubnetPlan } from '../ipplan/plan';

/** CSV exports (EXP-03, EXP-04): RFC 4180 quoting, `\r\n` line ends, one header row. */

export function toCsv(header: string[], rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return `${[header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

const gb = (bytes: number | '') =>
  bytes === '' || bytes === 0 ? '' : +(bytes / 1024 ** 3).toFixed(2);

export const devicesCsv = (rows: DeviceRow[]) =>
  toCsv(
    [
      'Name',
      'Kind',
      'Location',
      'Model',
      'CPU',
      'Threads',
      'RAM (GiB)',
      'Storage (GB)',
      'OS',
      'Workloads',
      'Internet',
      'Capacity',
      'Tags',
    ],
    rows.map((r) => [
      r.name,
      r.kind,
      r.location,
      r.model,
      r.cpu,
      r.threads || '',
      gb(r.memoryBytes),
      r.storageBytes ? +(r.storageBytes / 1e9).toFixed(0) : '',
      r.os,
      r.workloads,
      r.internet,
      r.capacity,
      r.tags.join('; '),
    ]),
  );

export const workloadsCsv = (rows: WorkloadRow[]) =>
  toCsv(
    [
      'Name',
      'Kind',
      'Host',
      'Device',
      'vCPU',
      'RAM (GiB)',
      'Disk (GB)',
      'Image / OS',
      'Internet',
      'Capacity',
      'Tags',
    ],
    rows.map((r) => [
      r.name,
      r.kind,
      r.host,
      r.device,
      r.cpu,
      gb(r.memoryBytes),
      r.diskBytes ? +(r.diskBytes / 1e9).toFixed(0) : '',
      r.image,
      r.internet,
      r.capacity,
      r.tags.join('; '),
    ]),
  );

export const appsCsv = (rows: AppRow[]) =>
  toCsv(
    [
      'Name',
      'Role',
      'Host',
      'Device',
      'Ports',
      'vCPU (recommended)',
      'RAM (GiB, recommended)',
      'Catalog',
      'Confidence',
      'Tags',
    ],
    rows.map((r) => [
      r.name,
      r.role,
      r.host,
      r.device,
      r.ports,
      r.cpu,
      gb(r.memoryBytes),
      r.catalog,
      r.confidence,
      r.tags.join('; '),
    ]),
  );

export const ipPlanCsv = (plans: SubnetPlan[]) =>
  toCsv(
    ['Subnet', 'VLAN', 'Zone', 'Address', 'Host', 'Interface', 'Type', 'Status'],
    plans.flatMap((p) =>
      p.rows.map((r) =>
        r.type === 'address'
          ? [
              p.subnet.cidr,
              p.vlan,
              p.zone,
              r.ip,
              r.owner?.name ?? '',
              r.iface,
              r.kind,
              r.conflict ? 'duplicate' : r.outside ? 'outside subnet' : 'ok',
            ]
          : [
              p.subnet.cidr,
              p.vlan,
              p.zone,
              `${r.from}-${r.to}`,
              '',
              '',
              r.type === 'pool' ? 'dhcp pool' : 'free',
              `${r.count} addresses`,
            ],
      ),
    ),
  );

/** Bill of materials (EXP-03): one line per device with its purchase status and price. */
export function bomCsv(project: Project, catalog: Catalog | null): string {
  const devices = Object.values(project.devices)
    .filter((d) => d.kind !== 'internet')
    .sort((a, b) => a.name.localeCompare(b.name));
  const rows = devices.map((d) => {
    const model = d.catalogRef
      ? catalog?.devices.find((m) => m.id === d.catalogRef?.id)
      : undefined;
    return [
      d.name,
      d.kind,
      model ? `${model.vendor} ${model.model}` : '',
      d.purchase?.status ?? 'owned',
      d.purchase?.price ?? '',
      d.purchase?.currency ?? '',
      d.purchase?.url ?? '',
    ];
  });
  const totals = new Map<string, number>();
  for (const d of devices) {
    if (d.purchase?.price === undefined || d.purchase.status === 'owned') continue;
    const currency = d.purchase.currency ?? '';
    totals.set(currency, (totals.get(currency) ?? 0) + d.purchase.price);
  }
  for (const [currency, total] of totals)
    rows.push(['Total to buy', '', '', '', +total.toFixed(2), currency, '']);
  return toCsv(['Item', 'Kind', 'Model', 'Status', 'Price', 'Currency', 'Link'], rows);
}
