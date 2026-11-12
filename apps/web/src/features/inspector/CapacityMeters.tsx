import type { CapacityReport, ResourceUsage } from '@server-planner/engine';
import type { Project } from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { formatSize } from '../../app/format';
import { Banner } from '../../ui/Banner';
import { SegmentBar } from '../../ui/SegmentBar';
import { Segmented } from '../../ui/Segmented';
import { useSelection } from '../canvas/selection';
import { useCapacityMode } from './capacityMode';
import { Section } from './parts';

const statusText: Record<ResourceUsage['status'], string> = {
  ok: 'text-text-secondary',
  warning: 'text-warning-text',
  critical: 'text-warning-text',
  over: 'text-error-text',
};

/** Capacity bars with breakdown (docs/05 § 5.2 Capacity tab, docs/04 § 6.9). */
export function CapacityMeters({ project, report }: { project: Project; report: CapacityReport }) {
  const { t } = useTranslation('inspector');
  const device = report.host.type === 'device' ? project.devices[report.host.id] : undefined;
  const thresholds = project.settings.capacityThresholds;
  const setDetail = useSelection((s) => s.setDetail);
  const cores = (n: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(n);
  const mode = useCapacityMode((s) => s.mode);
  const setMode = useCapacityMode((s) => s.set);

  const meter = (
    label: string,
    usage: ResourceUsage,
    format: (n: number) => string,
    forecast?: string,
  ) => {
    const percent = Math.round((Number.isFinite(usage.ratio) ? usage.ratio : 1) * 100);
    return (
      <div key={label} className="flex flex-col gap-1.5">
        <div className="flex justify-between gap-3">
          <span>{label}</span>
          <span
            className={`font-mono text-data ${statusText[usage.status]}`}
          >{`${format(usage.used)} / ${format(usage.capacity)} · ${percent}%`}</span>
        </div>
        <SegmentBar
          ratio={usage.ratio}
          label={t('capacity.meter', { label, percent })}
          {...thresholds}
        />
        {forecast ? <span className="text-body-sm text-text-secondary">{forecast}</span> : null}
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {usage.breakdown.map((b, i) => {
            const nameOf =
              b.kind === 'os'
                ? t('capacity.os')
                : b.kind === 'zfs-arc'
                  ? t('capacity.arc')
                  : b.ref.type === 'workload'
                    ? (project.workloads[b.ref.id]?.name ?? '?')
                    : (project.apps[b.ref.id]?.name ?? '?');
            const open =
              b.ref.type === 'workload' || b.ref.type === 'app'
                ? () => setDetail({ type: b.ref.type as 'workload' | 'app', id: b.ref.id })
                : undefined;
            return (
              <li
                key={`${b.ref.id}-${b.kind}-${i}`}
                className="flex justify-between gap-3 pl-3 text-body-sm text-text-secondary"
              >
                {open && b.kind !== 'os' ? (
                  <button
                    type="button"
                    onClick={open}
                    className="truncate text-left hover:text-text-primary hover:underline"
                  >
                    {nameOf}
                  </button>
                ) : (
                  <span className="truncate">{nameOf}</span>
                )}
                <span className="font-mono">{`${format(b.amount)}${b.unbounded ? ` · ${t('capacity.unbounded')}` : ''}`}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const worst = [report.cpu, report.memory, ...report.storage].find(
    (u) => u.status === 'over' || u.status === 'critical' || u.status === 'warning',
  );
  return (
    <Section
      title={t('capacity.title')}
      action={
        <Segmented
          label={t('capacity.mode')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'allocated', label: t('capacity.allocated') },
            { value: 'expected', label: t('capacity.expected') },
          ]}
        />
      }
    >
      {meter(t('capacity.cpu'), report.cpu, (n) =>
        mode === 'expected' ? t('capacity.cores', { count: cores(n) }) : `${cores(n)} vCPU`,
      )}
      {meter(t('capacity.memory'), report.memory, (n) => formatSize(n))}
      {report.storage.map((pool) =>
        meter(
          device?.hardware.pools.find((p) => p.id === pool.poolId)?.name ?? t('capacity.pool'),
          pool,
          (n) => formatSize(n, true),
          pool.growthPerMonth
            ? t('capacity.forecast', {
                growth: formatSize(pool.growthPerMonth, true),
                months: Math.floor(pool.monthsToFull ?? 0),
              })
            : undefined,
        ),
      )}
      {mode === 'expected' ? (
        <p className="m-0 text-body-sm text-text-muted">{t('capacity.expectedNote')}</p>
      ) : device && report.cpu.capacity > 0 ? (
        <p className="m-0 text-body-sm text-text-muted">
          {t('capacity.overcommit', {
            cpu: project.settings.defaultOvercommit.cpu,
            memory: project.settings.defaultOvercommit.memory,
          })}
        </p>
      ) : null}
      {device && report.cpu.capacity === 0 ? (
        <p className="m-0 text-body-sm text-text-muted">{t('capacity.noCpu')}</p>
      ) : null}
      {worst ? (
        <Banner kind={worst.status === 'over' ? 'error' : 'warning'}>{t('capacity.tip')}</Banner>
      ) : null}
    </Section>
  );
}
