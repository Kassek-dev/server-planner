import type { AnalysisResult, CapacityReport } from '@server-planner/engine';
import type { Project } from '@server-planner/model';
import { type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { formatSize } from '../../app/format';
import { useSession } from '../../app/services';
import { useResults } from '../../store/results';
import { Button } from '../../ui/Button';
import { Led } from '../../ui/Led';
import { SegmentBar } from '../../ui/SegmentBar';
import { useSelection } from '../canvas/selection';
import { useDrawer } from '../drawers/useDrawer';
import { bomTotals, hostReports, resourceTotals } from './summary';

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

/** V-02 Dashboard (CAP-09): resources, usage per host, issues, assertions, BOM, energy. */
export function DashboardView() {
  const { t } = useTranslation('views');
  const project = useSession((s) => s.project);
  const result = useResults((s) => s.result);
  const reports = useMemo(() => (project ? hostReports(project, result) : []), [project, result]);
  if (!project) return null;
  return (
    <section aria-label={t('dashboard.title')} className="flex min-w-0 flex-1 flex-col bg-app">
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
        <h2 className="m-0 text-title font-semibold">{t('dashboard.title')}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!result ? (
          <p className="m-0 text-text-secondary">{t('dashboard.computing')}</p>
        ) : (
          <div className="grid max-w-300 grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
            <ResourcesTile project={project} reports={reports} />
            <IssuesTile result={result} />
            <EnergyTile project={project} result={result} />
            <BomTile project={project} />
            <AssertionsTile project={project} result={result} />
            <HostsTile project={project} reports={reports} />
            <PowerTile project={project} result={result} />
          </div>
        )}
      </div>
    </section>
  );
}

function Tile({
  title,
  children,
  action,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  wide?: boolean;
}) {
  return (
    <article
      aria-label={title}
      className={`flex flex-col gap-3 rounded-md border border-border-subtle bg-panel p-4 ${wide ? 'col-span-full' : ''}`}
    >
      <header className="flex items-center gap-2">
        <h3 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
          {title}
        </h3>
        <span className="grow" />
        {action}
      </header>
      {children}
    </article>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-body-sm text-text-secondary">{label}</span>
      <span className="font-mono text-title font-semibold">{value}</span>
      {hint ? <span className="text-body-sm text-text-muted">{hint}</span> : null}
    </div>
  );
}

function ResourcesTile({ project, reports }: { project: Project; reports: CapacityReport[] }) {
  const { t } = useTranslation('views');
  const totals = resourceTotals(reports);
  const { warning, critical } = project.settings.capacityThresholds;
  const rows = [
    { key: 'cpu', value: t('dashboard.cores', { count: totals.cores }), ratio: totals.cpuRatio },
    { key: 'memory', value: formatSize(totals.memoryBytes), ratio: totals.memoryRatio },
    { key: 'storage', value: formatSize(totals.storageBytes, true), ratio: totals.storageRatio },
  ] as const;
  return (
    <Tile title={t('dashboard.resources')}>
      <span className="text-body-sm text-text-secondary">
        {t('dashboard.hosts', { count: totals.hosts })}
      </span>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[72px_1fr_88px_40px] items-center gap-2">
          <span className="text-body-sm text-text-secondary">{t(`dashboard.${r.key}`)}</span>
          <SegmentBar
            ratio={r.ratio}
            label={t('dashboard.allocated', {
              resource: t(`dashboard.${r.key}`),
              percent: percent(r.ratio),
            })}
            warning={warning}
            critical={critical}
            height={8}
          />
          <span className="text-right font-mono text-data">{r.value}</span>
          <span className="text-right font-mono text-data-sm text-text-muted">
            {percent(r.ratio)}
          </span>
        </div>
      ))}
    </Tile>
  );
}

function HostsTile({ project, reports }: { project: Project; reports: CapacityReport[] }) {
  const { t } = useTranslation('views');
  const { warning, critical } = project.settings.capacityThresholds;
  if (reports.length === 0) return null;
  return (
    <Tile title={t('dashboard.perHost')} wide>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="font-mono text-label tracking-[0.08em] text-text-secondary uppercase">
            <th className="py-1.5 pr-3 font-semibold">{t('dashboard.host')}</th>
            <th className="px-3 py-1.5 font-semibold">{t('dashboard.cpu')}</th>
            <th className="px-3 py-1.5 font-semibold">{t('dashboard.memory')}</th>
            <th className="px-3 py-1.5 font-semibold">{t('dashboard.storage')}</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => {
            const name = project.devices[r.host.id]?.name ?? '?';
            const storageCap = r.storage.reduce((s, p) => s + p.capacity, 0);
            const storageUsed = r.storage.reduce((s, p) => s + p.used, 0);
            const cells = [
              { key: 'cpu', ratio: r.cpu.ratio },
              { key: 'memory', ratio: r.memory.ratio },
              { key: 'storage', ratio: storageCap > 0 ? storageUsed / storageCap : 0 },
            ];
            return (
              <tr key={r.host.id} className="border-t border-border-subtle">
                <td className="py-1.5 pr-3">
                  <button
                    type="button"
                    className="text-accent-text hover:underline"
                    onClick={() => useSelection.getState().set([r.host.id])}
                  >
                    {name}
                  </button>
                </td>
                {cells.map((c) => (
                  <td key={c.key} className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-32">
                        <SegmentBar
                          ratio={c.ratio}
                          segments={16}
                          height={6}
                          label={t('dashboard.hostAllocated', {
                            host: name,
                            resource: t(`dashboard.${c.key}`),
                            percent: percent(c.ratio),
                          })}
                          warning={warning}
                          critical={critical}
                        />
                      </div>
                      <span className="font-mono text-data-sm text-text-secondary">
                        {Number.isFinite(c.ratio) ? percent(c.ratio) : '—'}
                      </span>
                    </div>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Tile>
  );
}

function IssuesTile({ result }: { result: AnalysisResult }) {
  const { t } = useTranslation('views');
  const [, setParams] = useSearchParams();
  const count = (s: string) => result.issues.filter((i) => i.severity === s).length;
  const errors = count('error');
  const warnings = count('warning');
  return (
    <Tile
      title={t('dashboard.issues')}
      action={
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set('panel', 'issues');
              return next;
            })
          }
        >
          {t('dashboard.showIssues')}
        </Button>
      }
    >
      <div className="flex gap-8">
        <span className="flex items-center gap-2">
          <Led status={errors > 0 ? 'error' : 'off'} />
          <Figure label={t('dashboard.errors')} value={String(errors)} />
        </span>
        <span className="flex items-center gap-2">
          <Led status={warnings > 0 ? 'warning' : 'off'} />
          <Figure label={t('dashboard.warnings')} value={String(warnings)} />
        </span>
        <Figure label={t('dashboard.infos')} value={String(count('info'))} />
      </div>
    </Tile>
  );
}

function AssertionsTile({ project, result }: { project: Project; result: AnalysisResult }) {
  const { t } = useTranslation('views');
  const { projectId = '' } = useParams();
  const total = Object.keys(project.assertions).length;
  const failed = result.assertions.filter((a) => a.passed === false).length;
  const passed = result.assertions.filter((a) => a.passed).length;
  return (
    <Tile
      title={t('dashboard.assertions')}
      action={
        <Link to={`/p/${projectId}/access`} className="text-body-sm text-accent-text">
          {t('dashboard.openAccess')}
        </Link>
      }
    >
      {total === 0 ? (
        <p className="m-0 text-text-secondary">{t('dashboard.noAssertions')}</p>
      ) : (
        <div className="flex gap-8">
          <span className="flex items-center gap-2">
            <Led status={passed > 0 ? 'ok' : 'off'} />
            <Figure label={t('dashboard.passed')} value={String(passed)} />
          </span>
          <span className="flex items-center gap-2">
            <Led status={failed > 0 ? 'error' : 'off'} />
            <Figure label={t('dashboard.failed')} value={String(failed)} />
          </span>
          <Figure label={t('dashboard.disabled')} value={String(total - passed - failed)} />
        </div>
      )}
    </Tile>
  );
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function BomTile({ project }: { project: Project }) {
  const { t } = useTranslation('views');
  const bom = bomTotals(project);
  const cost = (list: { currency: string; amount: number }[]) =>
    list.length === 0 ? '—' : list.map((c) => money(c.amount, c.currency)).join(' + ');
  return (
    <Tile title={t('dashboard.bom')}>
      <div className="grid grid-cols-2 gap-4">
        <Figure label={t('dashboard.toBuy', { count: bom.toBuy })} value={cost(bom.toBuyCost)} />
        <Figure
          label={t('dashboard.optional', { count: bom.optional })}
          value={cost(bom.optionalCost)}
        />
      </div>
      <span className="text-body-sm text-text-muted">
        {t('dashboard.owned', { count: bom.owned })}
        {bom.unpriced > 0 ? ` · ${t('dashboard.unpriced', { count: bom.unpriced })}` : ''}
      </span>
    </Tile>
  );
}

function EnergyTile({ project, result }: { project: Project; result: AnalysisResult }) {
  const { t } = useTranslation('views');
  const { open } = useDrawer();
  const { power } = result;
  const watts = (w: number) => `${Math.round(w)} W`;
  return (
    <Tile title={t('dashboard.energy')}>
      <div className="grid grid-cols-3 gap-4">
        <Figure label={t('dashboard.idle')} value={watts(power.totalIdleW)} />
        <Figure label={t('dashboard.expected')} value={watts(power.totalExpectedW)} />
        <Figure
          label={t('dashboard.perMonth')}
          value={`${Math.round(power.monthlyKwh)} kWh`}
          {...(power.monthlyCost
            ? { hint: money(power.monthlyCost.amount, power.monthlyCost.currency) }
            : {})}
        />
      </div>
      {!power.monthlyCost ? (
        <Button
          size="sm"
          variant="ghost"
          className="self-start px-0"
          onClick={() => open({ kind: 'settings' })}
        >
          {t('dashboard.setPrice')}
        </Button>
      ) : null}
      {power.unknown.length > 0 ? (
        <span className="text-body-sm text-text-muted">
          {t('dashboard.unknownPower', {
            count: power.unknown.length,
            names: power.unknown
              .slice(0, 3)
              .map((id) => project.devices[id]?.name ?? '?')
              .join(', '),
          })}
        </span>
      ) : null}
    </Tile>
  );
}

function PowerTile({ project, result }: { project: Project; result: AnalysisResult }) {
  const { t } = useTranslation('views');
  const { poe, ups } = result.power;
  const { warning, critical } = project.settings.capacityThresholds;
  if (poe.length === 0 && ups.length === 0) return null;
  const name = (id: string) => project.devices[id]?.name ?? '?';
  return (
    <Tile title={t('dashboard.powerBudgets')} wide>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {poe.map((b) => (
          <li
            key={`poe:${b.deviceId}`}
            className="grid grid-cols-[200px_1fr_200px] items-center gap-3"
          >
            <span>{t('dashboard.poeOf', { name: name(b.deviceId) })}</span>
            {b.budgetW > 0 ? (
              <SegmentBar
                ratio={b.ratio}
                height={8}
                label={t('dashboard.poeUsage', {
                  name: name(b.deviceId),
                  percent: percent(b.ratio),
                })}
                warning={warning}
                critical={critical}
              />
            ) : (
              <span className="text-body-sm text-text-muted">{t('dashboard.noBudget')}</span>
            )}
            <span className="text-right font-mono text-data">
              {b.budgetW > 0
                ? t('dashboard.wattsOf', { used: Math.round(b.usedW * 10) / 10, total: b.budgetW })
                : `${Math.round(b.usedW * 10) / 10} W`}
            </span>
          </li>
        ))}
        {ups.map((u) => (
          <li
            key={`ups:${u.deviceId}`}
            className="grid grid-cols-[200px_1fr_200px] items-center gap-3"
          >
            <span>{t('dashboard.upsOf', { name: name(u.deviceId) })}</span>
            <SegmentBar
              ratio={u.ratio}
              height={8}
              label={t('dashboard.upsUsage', { name: name(u.deviceId), percent: percent(u.ratio) })}
              warning={warning}
              critical={critical}
            />
            <span className="text-right font-mono text-data">
              {t('dashboard.wattsOf', { used: Math.round(u.loadW), total: u.capacityW })}
              {u.runtimeMin !== undefined
                ? ` · ${t('dashboard.runtime', { minutes: Math.round(u.runtimeMin) })}`
                : ''}
            </span>
          </li>
        ))}
      </ul>
    </Tile>
  );
}
