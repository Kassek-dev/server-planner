import type { InternetAccess, UsageStatus } from '@server-planner/engine';
import { type Project, updateApp, updateDevice, updateWorkload } from '@server-planner/model';
import { createColumnHelper } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSize } from '../../app/format';
import { useSession } from '../../app/services';
import { useCatalog } from '../../catalog/store';
import { useResults } from '../../store/results';
import { Checkbox } from '../../ui/Checkbox';
import { Led, type LedStatus } from '../../ui/Led';
import { Segmented } from '../../ui/Segmented';
import { useSelection } from '../canvas/selection';
import { useMoveDevice } from '../inspector/device/moveDevice';
import { useCommand } from '../inspector/parts';
import { type Column, DataTable, type features } from './DataTable';
import {
  type AppRow,
  appRows,
  type DeviceRow,
  deviceRows,
  type WorkloadRow,
  workloadRows,
} from './rows';

type Mode = 'devices' | 'workloads' | 'apps';

const USAGE_LED: Record<UsageStatus, LedStatus> = {
  ok: 'ok',
  warning: 'warning',
  critical: 'error',
  over: 'error',
};
const INTERNET_LED: Record<InternetAccess, LedStatus> = {
  full: 'ok',
  partial: 'warning',
  none: 'error',
};

/** V-03 Inventory (docs/05 § 9): devices, workloads or apps as a table; edits go through commands. */
export function InventoryView() {
  const { t } = useTranslation('views');
  const project = useSession((s) => s.project);
  const catalog = useCatalog((s) => s.catalog);
  const result = useResults((s) => s.result);
  const [mode, setMode] = useState<Mode>('devices');
  const [query, setQuery] = useState('');
  const [grouped, setGrouped] = useState(true);
  const selection = useSelection();
  useEffect(() => {
    void useCatalog.getState().load();
  }, []);

  const devices = useMemo(
    () => (project ? deviceRows(project, catalog, result) : []),
    [project, catalog, result],
  );
  const workloads = useMemo(
    () => (project ? workloadRows(project, result) : []),
    [project, result],
  );
  const apps = useMemo(() => (project ? appRows(project, catalog) : []), [project, catalog]);
  if (!project) return null;

  const selectedId =
    selection.detail?.id ?? (selection.nodeIds.length === 1 ? selection.nodeIds[0] : undefined);
  const counts = { devices: devices.length, workloads: workloads.length, apps: apps.length };

  return (
    <section aria-label={t('inventory.title')} className="flex min-w-0 flex-1 flex-col bg-app">
      <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-3">
        <h2 className="m-0 text-title font-semibold">{t('inventory.title')}</h2>
        <div className="w-96">
          <Segmented
            label={t('inventory.show')}
            value={mode}
            onChange={setMode}
            options={(['devices', 'workloads', 'apps'] as const).map((m) => ({
              value: m,
              label: t(`inventory.modes.${m}`, { count: counts[m] }),
            }))}
          />
        </div>
        <input
          type="search"
          aria-label={t('inventory.search')}
          placeholder={t('inventory.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-64 rounded-md border border-border-default bg-inset px-2.5 text-body text-text-primary outline-none focus:border-accent"
        />
        {mode === 'devices' ? (
          <Checkbox
            label={t('inventory.groupByLocation')}
            checked={grouped}
            onChange={(e) => setGrouped(e.target.checked)}
          />
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {mode === 'devices' ? (
          <DeviceTable
            project={project}
            rows={devices}
            query={query}
            grouped={grouped}
            selectedId={selectedId}
          />
        ) : null}
        {mode === 'workloads' ? (
          <WorkloadTable rows={workloads} query={query} selectedId={selectedId} />
        ) : null}
        {mode === 'apps' ? <AppTable rows={apps} query={query} selectedId={selectedId} /> : null}
      </div>
    </section>
  );
}

/** Name cell: edit in place; focusing it selects the row (keyboard path to the inspector). */
function NameCell({
  value,
  onCommit,
  onFocus,
}: {
  value: string;
  onCommit: (name: string) => void;
  onFocus: () => void;
}) {
  const { t } = useTranslation('views');
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };
  return (
    <input
      aria-label={t('inventory.rename', { name: value })}
      value={draft}
      onFocus={onFocus}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className="h-7 w-44 rounded-md border border-transparent bg-transparent px-1.5 font-medium text-text-primary outline-none hover:border-border-default focus:border-accent focus:bg-inset"
    />
  );
}

function StatusCell({ status, label }: { status: LedStatus | undefined; label: string }) {
  if (!status) return <span className="text-text-muted">—</span>;
  return (
    <span className="flex items-center gap-1.5">
      <Led status={status} size={7} />
      <span className="text-body-sm text-text-secondary">{label}</span>
    </span>
  );
}

const mono = (value: string) => (
  <span className="font-mono text-data text-text-secondary">{value || '—'}</span>
);
const size = (bytes: number | '') => mono(bytes === '' || bytes === 0 ? '' : formatSize(bytes));
const tags = (list: string[]) => (
  <span className="text-body-sm text-text-secondary">{list.join(', ') || '—'}</span>
);

const deviceHelper = createColumnHelper<typeof features, DeviceRow>();
const workloadHelper = createColumnHelper<typeof features, WorkloadRow>();
const appHelper = createColumnHelper<typeof features, AppRow>();

function DeviceTable({
  project,
  rows,
  query,
  grouped,
  selectedId,
}: {
  project: Project;
  rows: DeviceRow[];
  query: string;
  grouped: boolean;
  selectedId: string | undefined;
}) {
  const { t } = useTranslation(['views', 'canvas']);
  const run = useCommand();
  const move = useMoveDevice();
  const select = (row: DeviceRow) => useSelection.getState().set([row.id]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: command wrappers are recreated each render; columns depend only on the listed values
  const columns = useMemo(
    () =>
      deviceHelper.columns([
        deviceHelper.accessor('name', {
          header: () => t('inventory.columns.name'),
          cell: (c) => (
            <NameCell
              value={c.getValue()}
              onFocus={() => select(c.row.original)}
              onCommit={(name) => run(updateDevice, { id: c.row.original.id, changes: { name } })}
            />
          ),
        }),
        deviceHelper.accessor('kind', {
          header: () => t('inventory.columns.kind'),
          cell: (c) => t(`canvas:deviceKind.${c.getValue()}`),
        }),
        deviceHelper.accessor('location', {
          header: () => t('inventory.columns.location'),
          cell: (c) => {
            const row = c.row.original;
            const device = project.devices[row.id];
            if (!device?.formFactor) return mono('');
            return (
              <select
                aria-label={t('inventory.moveTo', { name: row.name })}
                value={row.locationId}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => move(project, device, e.target.value)}
                className="h-7 rounded-md border border-transparent bg-transparent px-1 text-body text-text-primary hover:border-border-default focus:border-accent"
              >
                <option value="">{t('inventory.unplaced')}</option>
                {Object.values(project.locations).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            );
          },
        }),
        deviceHelper.accessor('model', {
          header: () => t('inventory.columns.model'),
          cell: (c) => c.getValue() || '—',
        }),
        deviceHelper.accessor('cpu', {
          header: () => t('inventory.columns.cpu'),
          cell: (c) => mono(c.getValue() ? `${c.getValue()} · ${c.row.original.threads}T` : ''),
        }),
        deviceHelper.accessor('memoryBytes', {
          header: () => t('inventory.columns.ram'),
          cell: (c) => size(c.getValue()),
        }),
        deviceHelper.accessor('storageBytes', {
          header: () => t('inventory.columns.storage'),
          cell: (c) => mono(c.getValue() ? formatSize(c.getValue(), true) : ''),
        }),
        deviceHelper.accessor('os', {
          header: () => t('inventory.columns.os'),
          cell: (c) => c.getValue() || '—',
        }),
        deviceHelper.accessor('workloads', {
          header: () => t('inventory.columns.workloads'),
          cell: (c) => mono(String(c.getValue() || '')),
        }),
        deviceHelper.accessor('internet', {
          header: () => t('inventory.columns.internet'),
          cell: (c) => {
            const v = c.getValue();
            return (
              <StatusCell
                status={v ? INTERNET_LED[v] : undefined}
                label={v ? t(`inventory.internet.${v}`) : ''}
              />
            );
          },
        }),
        deviceHelper.accessor('capacity', {
          header: () => t('inventory.columns.capacity'),
          cell: (c) => {
            const v = c.getValue();
            return (
              <StatusCell
                status={v ? USAGE_LED[v] : undefined}
                label={v ? t(`inventory.capacity.${v}`) : ''}
              />
            );
          },
        }),
        deviceHelper.accessor('tags', {
          header: () => t('inventory.columns.tags'),
          cell: (c) => tags(c.getValue()),
          enableSorting: false,
        }),
      ]),
    [project, t],
  );
  return (
    <DataTable
      label={t('inventory.modes.devices', { count: rows.length })}
      rows={rows}
      columns={columns as Column<DeviceRow>[]}
      rowId={(r) => r.id}
      query={query}
      selectedId={selectedId}
      onSelect={select}
      {...(grouped ? { groupOf: (r: DeviceRow) => r.location || t('inventory.unplaced') } : {})}
      empty={t('inventory.empty')}
    />
  );
}

function WorkloadTable({
  rows,
  query,
  selectedId,
}: {
  rows: WorkloadRow[];
  query: string;
  selectedId: string | undefined;
}) {
  const { t } = useTranslation('views');
  const run = useCommand();
  const select = (row: WorkloadRow) =>
    useSelection.getState().setDetail({ type: 'workload', id: row.id });
  // biome-ignore lint/correctness/useExhaustiveDependencies: command wrappers are recreated each render; columns depend only on the listed values
  const columns = useMemo(
    () =>
      workloadHelper.columns([
        workloadHelper.accessor('name', {
          header: () => t('inventory.columns.name'),
          cell: (c) => (
            <NameCell
              value={c.getValue()}
              onFocus={() => select(c.row.original)}
              onCommit={(name) => run(updateWorkload, { id: c.row.original.id, changes: { name } })}
            />
          ),
        }),
        workloadHelper.accessor('kind', {
          header: () => t('inventory.columns.kind'),
          cell: (c) => mono(c.getValue().toUpperCase()),
        }),
        workloadHelper.accessor('host', { header: () => t('inventory.columns.host') }),
        workloadHelper.accessor('device', { header: () => t('inventory.columns.device') }),
        workloadHelper.accessor('cpu', {
          header: () => t('inventory.columns.vcpu'),
          cell: (c) => mono(String(c.getValue())),
        }),
        workloadHelper.accessor('memoryBytes', {
          header: () => t('inventory.columns.ram'),
          cell: (c) => size(c.getValue()),
        }),
        workloadHelper.accessor('diskBytes', {
          header: () => t('inventory.columns.disk'),
          cell: (c) => mono(c.getValue() ? formatSize(c.getValue(), true) : ''),
        }),
        workloadHelper.accessor('image', {
          header: () => t('inventory.columns.image'),
          cell: (c) => mono(c.getValue()),
        }),
        workloadHelper.accessor('internet', {
          header: () => t('inventory.columns.internet'),
          cell: (c) => {
            const v = c.getValue();
            return (
              <StatusCell
                status={v ? INTERNET_LED[v] : undefined}
                label={v ? t(`inventory.internet.${v}`) : ''}
              />
            );
          },
        }),
        workloadHelper.accessor('capacity', {
          header: () => t('inventory.columns.capacity'),
          cell: (c) => {
            const v = c.getValue();
            return (
              <StatusCell
                status={v ? USAGE_LED[v] : undefined}
                label={v ? t(`inventory.capacity.${v}`) : ''}
              />
            );
          },
        }),
      ]),
    [t],
  );
  return (
    <DataTable
      label={t('inventory.modes.workloads', { count: rows.length })}
      rows={rows}
      columns={columns as Column<WorkloadRow>[]}
      rowId={(r) => r.id}
      query={query}
      selectedId={selectedId}
      onSelect={select}
      empty={t('inventory.empty')}
    />
  );
}

function AppTable({
  rows,
  query,
  selectedId,
}: {
  rows: AppRow[];
  query: string;
  selectedId: string | undefined;
}) {
  const { t } = useTranslation('views');
  const run = useCommand();
  const select = (row: AppRow) => useSelection.getState().setDetail({ type: 'app', id: row.id });
  // biome-ignore lint/correctness/useExhaustiveDependencies: command wrappers are recreated each render; columns depend only on the listed values
  const columns = useMemo(
    () =>
      appHelper.columns([
        appHelper.accessor('name', {
          header: () => t('inventory.columns.name'),
          cell: (c) => (
            <NameCell
              value={c.getValue()}
              onFocus={() => select(c.row.original)}
              onCommit={(name) => run(updateApp, { id: c.row.original.id, changes: { name } })}
            />
          ),
        }),
        appHelper.accessor('role', { header: () => t('inventory.columns.role') }),
        appHelper.accessor('host', { header: () => t('inventory.columns.host') }),
        appHelper.accessor('device', { header: () => t('inventory.columns.device') }),
        appHelper.accessor('ports', {
          header: () => t('inventory.columns.ports'),
          cell: (c) => mono(c.getValue()),
        }),
        appHelper.accessor('cpu', {
          header: () => t('inventory.columns.vcpu'),
          cell: (c) => mono(String(c.getValue())),
        }),
        appHelper.accessor('memoryBytes', {
          header: () => t('inventory.columns.ram'),
          cell: (c) => size(c.getValue()),
        }),
        appHelper.accessor('catalog', {
          header: () => t('inventory.columns.catalog'),
          cell: (c) => c.getValue() || '—',
        }),
        appHelper.accessor('confidence', {
          header: () => t('inventory.columns.confidence'),
          cell: (c) => mono(c.getValue()),
        }),
      ]),
    [t],
  );
  return (
    <DataTable
      label={t('inventory.modes.apps', { count: rows.length })}
      rows={rows}
      columns={columns as Column<AppRow>[]}
      rowId={(r) => r.id}
      query={query}
      selectedId={selectedId}
      onSelect={select}
      empty={t('inventory.empty')}
    />
  );
}
