import type { AnalysisResult } from '@server-planner/engine';
import type { Project } from '@server-planner/model';
import { GitBranch } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatSize } from '../../app/format';
import { useServices, useSession } from '../../app/services';
import { catalogDevice, engineOptions, useCatalog } from '../../catalog/store';
import { useResults } from '../../store/results';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { useSelection } from '../canvas/selection';
import { modelName } from '../catalog/DeviceModelPicker';
import { DiffList } from '../snapshots/SnapshotsView';
import { type Comparison, compareProjects, type Side, type Upgrade } from './compare';
import { useVariantDialog, useVariantOf } from './variants';

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

/** Sum of priced purchases per currency, as text. */
function cost(list: Side['bom']['toBuyCost']): string {
  if (list.length === 0) return '—';
  return list
    .map(({ amount, currency }) => {
      try {
        return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount);
      } catch {
        return `${amount.toFixed(2)} ${currency}`;
      }
    })
    .join(' + ');
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
      {children}
    </h3>
  );
}

/**
 * V-09 Compare (PRJ-10): a variant against its base project — totals side by side, the parts to
 * buy and every change. Projects that are not variants offer to create one.
 */
export function CompareView() {
  const { t } = useTranslation('views');
  const { repository, analyzer } = useServices();
  const project = useSession((s) => s.project);
  const variantResult = useResults((s) => s.result);
  const catalog = useCatalog((s) => s.catalog);
  const link = useVariantOf(project?.id ?? '');
  const [base, setBase] = useState<Project | null | undefined>(undefined);
  const [baseResult, setBaseResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    if (!link?.baseId) return;
    let cancelled = false;
    void repository.get(link.baseId).then(async (found) => {
      if (cancelled) return;
      setBase(found ?? null);
      if (found) {
        const result = await analyzer(found, engineOptions(catalog));
        if (!cancelled) setBaseResult(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [link?.baseId, repository, analyzer, catalog]);

  if (!project || link === undefined) return null;
  const header = (
    <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
      <h2 className="m-0 text-title font-semibold">{t('compare.title')}</h2>
      <span className="grow" />
      <Button
        icon={<GitBranch size={14} aria-hidden="true" />}
        onClick={() => useVariantDialog.getState().setOpen(true)}
      >
        {t('compare.create')}
      </Button>
    </div>
  );
  const body = (content: ReactNode) => (
    <section aria-label={t('compare.title')} className="flex min-w-0 flex-1 flex-col bg-app">
      {header}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex max-w-240 flex-col gap-6">{content}</div>
      </div>
    </section>
  );

  if (!link.baseId)
    return body(<p className="m-0 text-text-secondary">{t('compare.notVariant')}</p>);
  if (base === null) return body(<Banner kind="warning">{t('compare.baseMissing')}</Banner>);
  if (!base) return body(<p className="m-0 text-text-secondary">{t('compare.loading')}</p>);
  const c = compareProjects(base, project, baseResult, variantResult);
  // Catalog model names instead of ids for new devices.
  for (const u of c.upgrades)
    if (u.kind === 'device' && u.model) {
      const model = catalogDevice(catalog, u.model);
      if (model) u.model = modelName(model);
    }
  return body(
    <>
      <p className="m-0">
        {t('compare.variantOf')}{' '}
        <Link to={`/p/${base.id}`} className="font-medium text-accent-text">
          {base.name}
        </Link>
      </p>
      <Totals c={c} />
      <section className="flex flex-col gap-2" aria-label={t('compare.toBuy')}>
        <Heading>{t('compare.toBuy')}</Heading>
        {c.upgrades.length === 0 ? (
          <p className="m-0 text-text-secondary">{t('compare.nothingToBuy')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col rounded-md border border-border-subtle bg-panel p-0">
            {c.upgrades.map((u) => (
              <li
                key={`${u.kind}:${u.deviceId}`}
                className="flex items-center gap-3 border-b border-border-subtle px-3 py-1.5 last:border-b-0"
              >
                <button
                  type="button"
                  className="min-w-24 text-left font-medium hover:underline"
                  onClick={() => useSelection.getState().set([u.deviceId])}
                >
                  {u.name}
                </button>
                <span className="flex-1 font-mono text-data-sm text-text-secondary">
                  <UpgradeText upgrade={u} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-2" aria-label={t('compare.changes')}>
        <Heading>{t('compare.changes')}</Heading>
        <DiffList diff={c.diff} />
      </section>
    </>,
  );
}

function UpgradeText({ upgrade: u }: { upgrade: Upgrade }) {
  const { t } = useTranslation('views');
  switch (u.kind) {
    case 'device':
      return (
        <>
          {u.model
            ? t('compare.upgrade.deviceModel', { model: u.model })
            : t('compare.upgrade.device')}
        </>
      );
    case 'memory':
      return (
        <>
          {t('compare.upgrade.memory', {
            before: formatSize(u.before),
            after: formatSize(u.after),
            added: formatSize(u.after - u.before),
          })}
        </>
      );
    case 'disks':
      return (
        <>
          {t('compare.upgrade.disks', {
            list: u.disks.map((d) => `${formatSize(d.sizeBytes, true)} ${d.type}`).join(', '),
          })}
        </>
      );
    case 'gpu':
      return <>{t('compare.upgrade.gpu', { list: u.models.join(', ') })}</>;
    case 'cpu':
      return <>{t('compare.upgrade.cpu', { before: u.before, after: u.after })}</>;
  }
}

/** Base | variant | change for the figures that matter when deciding. */
function Totals({ c }: { c: Comparison }) {
  const { t } = useTranslation('views');
  const rows: { key: string; base: string; variant: string; better?: boolean }[] = [
    {
      key: 'cores',
      base: String(c.base.resources.cores),
      variant: String(c.variant.resources.cores),
    },
    {
      key: 'memory',
      base: formatSize(c.base.resources.memoryBytes),
      variant: formatSize(c.variant.resources.memoryBytes),
    },
    {
      key: 'storage',
      base: formatSize(c.base.resources.storageBytes, true),
      variant: formatSize(c.variant.resources.storageBytes, true),
    },
    {
      key: 'memoryUse',
      base: pct(c.base.resources.memoryRatio),
      variant: pct(c.variant.resources.memoryRatio),
      better: c.variant.resources.memoryRatio < c.base.resources.memoryRatio,
    },
    {
      key: 'cpuUse',
      base: pct(c.base.resources.cpuRatio),
      variant: pct(c.variant.resources.cpuRatio),
      better: c.variant.resources.cpuRatio < c.base.resources.cpuRatio,
    },
    {
      key: 'issues',
      base: t('compare.issueCount', { errors: c.base.errors, warnings: c.base.warnings }),
      variant: t('compare.issueCount', { errors: c.variant.errors, warnings: c.variant.warnings }),
      better: c.variant.errors + c.variant.warnings < c.base.errors + c.base.warnings,
    },
    { key: 'idle', base: `${c.base.idleW} W`, variant: `${c.variant.idleW} W` },
    {
      key: 'toBuyCost',
      base: cost(c.base.bom.toBuyCost),
      variant: cost(c.variant.bom.toBuyCost),
    },
  ];
  return (
    <table className="w-full max-w-160 border-collapse text-body">
      <caption className="sr-only">{t('compare.totals')}</caption>
      <thead>
        <tr className="text-left font-mono text-label tracking-[0.08em] text-text-secondary uppercase">
          <th scope="col" className="py-1.5 font-semibold">
            {t('compare.metric')}
          </th>
          <th scope="col" className="py-1.5 font-semibold">
            {t('compare.base')}
          </th>
          <th scope="col" className="py-1.5 font-semibold">
            {t('compare.variant')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-border-subtle">
            <th scope="row" className="py-1.5 text-left font-normal text-text-secondary">
              {t(`compare.rows.${r.key}`)}
            </th>
            <td className="py-1.5 font-mono text-data">{r.base}</td>
            <td
              className={`py-1.5 font-mono text-data ${r.base === r.variant ? '' : r.better === false ? 'text-warning-text' : 'font-semibold text-text-primary'}`}
            >
              {r.variant}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
