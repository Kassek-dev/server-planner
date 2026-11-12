import type { CatalogDevice, DeviceKind } from '@server-planner/model';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSize } from '../../app/format';
import { useCatalog } from '../../catalog/store';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';

/** D-05 Device model picker (docs/07): filters by type and vendor, search, specs table, Use. */
export function DeviceModelPicker({
  open,
  onOpenChange,
  kind,
  title,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed kind (Hardware › Model); without it every kind is offered (library). */
  kind?: DeviceKind;
  title: string;
  onPick: (model: CatalogDevice, catalogVersion: string) => void;
}) {
  const { t } = useTranslation('catalog');
  const catalog = useCatalog((s) => s.catalog);
  const [kinds, setKinds] = useState<string[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    if (open) void useCatalog.getState().load();
  }, [open]);

  const all = (catalog?.devices ?? []).filter((d) => !kind || d.kind === kind);
  const kindOptions = [...new Set(all.map((d) => d.kind))];
  const vendorOptions = [...new Set(all.map((d) => d.vendor))].sort();
  const q = query.trim().toLowerCase();
  const results = all.filter(
    (d) =>
      (kinds.length === 0 || kinds.includes(d.kind)) &&
      (vendors.length === 0 || vendors.includes(d.vendor)) &&
      (!q ||
        `${d.vendor} ${d.model} ${d.hardware.cpus.map((c) => c.model).join(' ')}`
          .toLowerCase()
          .includes(q)),
  );
  const selected = results.find((d) => d.id === chosen);
  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      closeLabel={t('cancel')}
      width={1120}
      flush
      footer={
        <>
          <span className="mr-auto truncate font-mono text-data text-text-secondary">
            {selected
              ? t('models.footer', {
                  model: modelName(selected),
                  version: catalog?.catalogVersion ?? '',
                })
              : t('models.pick')}
          </span>
          <Button onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button
            variant="primary"
            disabled={!selected || !catalog}
            onClick={() => {
              if (!selected || !catalog) return;
              onPick(selected, catalog.catalogVersion);
              onOpenChange(false);
            }}
          >
            {t('models.use')}
          </Button>
        </>
      }
    >
      <div className="flex h-[480px] min-h-0">
        <div className="flex w-55 shrink-0 flex-col gap-4 overflow-auto border-r border-border-subtle p-4">
          {kind ? null : (
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1.5 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
                {t('models.type')}
              </legend>
              {kindOptions.map((k) => (
                <Checkbox
                  key={k}
                  label={t(`canvas:deviceKind.${k}`)}
                  checked={kinds.includes(k)}
                  onChange={() => toggle(kinds, setKinds, k)}
                />
              ))}
            </fieldset>
          )}
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1.5 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
              {t('models.vendor')}
            </legend>
            {vendorOptions.map((v) => (
              <Checkbox
                key={v}
                label={v}
                checked={vendors.includes(v)}
                onChange={() => toggle(vendors, setVendors, v)}
              />
            ))}
          </fieldset>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-auto p-4">
          <input
            type="search"
            aria-label={t('models.search')}
            placeholder={t('models.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 shrink-0 rounded-md border border-border-default bg-inset px-2.5 text-body text-text-primary outline-none focus:border-accent"
          />
          <span className="font-mono text-data-sm text-text-muted" role="status">
            {t('models.results', { count: results.length })} · {t('models.perfHint')}
          </span>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="font-mono text-label tracking-[0.08em] text-text-secondary uppercase">
                <th className="py-1.5 pr-3 font-semibold">{t('models.columns.model')}</th>
                <th className="py-1.5 pr-3 font-semibold">{t('models.columns.cpu')}</th>
                <th className="py-1.5 pr-3 font-semibold" title={t('models.perfHint')}>
                  {t('models.columns.perf')}
                </th>
                <th className="py-1.5 pr-3 font-semibold">{t('models.columns.ram')}</th>
                <th className="py-1.5 pr-3 font-semibold">{t('models.columns.nic')}</th>
                <th className="py-1.5 pr-3 font-semibold">{t('models.columns.idle')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((d) => {
                const cpu = d.hardware.cpus[0];
                const mem = d.hardware.memory;
                const wired = d.ports.filter((p) => p.kind !== 'wifi-radio');
                const active = d.id === chosen;
                return (
                  <tr
                    key={d.id}
                    aria-selected={active}
                    className={`border-t border-border-subtle ${active ? 'bg-accent-subtle' : 'hover:bg-tile-header'}`}
                  >
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        className="text-left font-semibold"
                        onClick={() => setChosen(d.id)}
                        onDoubleClick={() => {
                          if (!catalog) return;
                          onPick(d, catalog.catalogVersion);
                          onOpenChange(false);
                        }}
                      >
                        {modelName(d)}
                      </button>
                    </td>
                    <td className="py-2 pr-3 font-mono text-data">
                      {cpu
                        ? `${cpu.model.replace(/^(Intel|AMD) /, '')} · ${cpu.cores}C/${cpu.threads}T${d.hardware.cpus.length > 1 ? ` × ${d.hardware.cpus.length}` : ''}`
                        : '—'}
                    </td>
                    <td className="py-2 pr-3">
                      <PerfCell
                        cpus={d.hardware.cpus}
                        label={t('models.perfLabel', { model: modelName(d) })}
                      />
                    </td>
                    <td className="py-2 pr-3 font-mono text-data">
                      {mem?.maxBytes
                        ? `${formatSize(mem.maxBytes)}${mem.slotsTotal ? ` · ${mem.slotsTotal}` : ''}`
                        : mem?.modules[0]
                          ? formatSize(mem.modules[0].sizeBytes)
                          : '—'}
                    </td>
                    <td className="py-2 pr-3 font-mono text-data">
                      {portSummary(wired.map((p) => p.speedMbps))}
                    </td>
                    <td className="py-2 font-mono text-data">
                      {d.hardware.power ? `${d.hardware.power.idleW} W` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Dialog>
  );
}

/** "Raspberry Pi 4" rather than "Raspberry Pi Raspberry Pi 4" when the model repeats the vendor. */
export const modelName = (d: Pick<CatalogDevice, 'vendor' | 'model'>) =>
  d.model.toLowerCase().startsWith(d.vendor.toLowerCase()) ? d.model : `${d.vendor} ${d.model}`;

/** "24 × 1G · 2 × 10G" — wired ports grouped by speed. */
export function portSummary(speeds: (number | undefined)[]): string {
  if (speeds.length === 0) return '—';
  const counts = new Map<number, number>();
  for (const s of speeds) counts.set(s ?? 0, (counts.get(s ?? 0) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([speed, n]) =>
        `${n} × ${speed === 0 ? '?' : speed >= 1000 ? `${speed / 1000}G` : `${speed}M`}`,
    )
    .join(' · ');
}

/** Relative multi-core performance (Blender Open Data, i5-8500T = 100); several CPUs add up. */
function PerfCell({ cpus, label }: { cpus: CatalogDevice['hardware']['cpus']; label: string }) {
  const scores = cpus.map((c) => c.perf?.score).filter((s): s is number => s !== undefined);
  if (scores.length === 0 || scores.length !== cpus.length)
    return <span className="font-mono text-data text-text-muted">—</span>;
  const score = Math.round(scores.reduce((a, b) => a + b, 0));
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className="relative inline-block h-1.5 w-12 bg-port-empty">
        <span
          className="absolute inset-y-0 left-0 bg-ok"
          style={{ width: `${Math.min(100, (score / 300) * 100)}%` }}
        />
      </span>
      <span role="img" aria-label={`${label}: ${score}`} className="font-mono text-data">
        {score}
      </span>
    </span>
  );
}
