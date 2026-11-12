import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../app/services';
import { Button } from '../../ui/Button';
import { Led } from '../../ui/Led';
import { SegmentBar } from '../../ui/SegmentBar';
import { useSelection } from '../canvas/selection';
import { useDrawer } from '../drawers/useDrawer';
import { type AddressRow, ipPlan, type SubnetPlan } from './plan';

/** V-04 IP Plan (docs/05 § 9): subnet cards with the DHCP pool, addresses, conflicts, free ranges. */
export function IpPlanView() {
  const { t } = useTranslation('views');
  const project = useSession((s) => s.project);
  const { open } = useDrawer();
  const plans = useMemo(() => (project ? ipPlan(project) : []), [project]);
  if (!project) return null;
  return (
    <section aria-label={t('ip.title')} className="flex min-w-0 flex-1 flex-col bg-app">
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
        <h2 className="m-0 text-title font-semibold">{t('ip.title')}</h2>
        <span className="font-mono text-data-sm text-text-muted">
          {t('ip.summary', { subnets: plans.length })}
        </span>
        <span className="grow" />
        <Button size="sm" onClick={() => open({ kind: 'vlans' })}>
          {t('ip.editSubnets')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {plans.length === 0 ? (
          <p className="m-0 text-text-secondary">{t('ip.empty')}</p>
        ) : (
          <div className="flex max-w-240 flex-col gap-6">
            {plans.map((plan) => (
              <SubnetCard key={plan.subnet.id} plan={plan} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SubnetCard({ plan }: { plan: SubnetPlan }) {
  const { t } = useTranslation('views');
  const { subnet, pool } = plan;
  const conflicts = plan.rows.filter((r) => r.type === 'address' && r.conflict).length;
  const select = (row: AddressRow) => {
    if (!row.owner) return;
    if (row.owner.type === 'device') useSelection.getState().set([row.owner.id]);
    else useSelection.getState().setDetail({ type: 'workload', id: row.owner.id });
  };
  return (
    <article
      aria-label={subnet.cidr}
      className="overflow-hidden rounded-md border border-border-subtle bg-panel"
    >
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border-subtle px-4 py-3">
        <h3 className="m-0 font-mono text-title font-semibold">{subnet.cidr}</h3>
        <Fact label={t('ip.vlan')} value={plan.vlan || '—'} />
        <Fact label={t('ip.zone')} value={plan.zone || '—'} />
        <Fact label={t('ip.gateway')} value={subnet.gateway ?? '—'} />
        <Fact
          label={t('ip.used')}
          value={
            plan.hosts !== undefined
              ? t('ip.usedOf', { used: plan.used, hosts: plan.hosts })
              : String(plan.used)
          }
        />
        {conflicts > 0 ? (
          <span className="flex items-center gap-1.5 text-body-sm text-error-text">
            <Led status="error" size={7} />
            {t('ip.conflicts', { count: conflicts })}
          </span>
        ) : null}
        {pool ? (
          <div className="flex w-full items-center gap-3">
            <span className="text-body-sm text-text-secondary">
              {t('ip.pool', { from: pool.from, to: pool.to, leases: pool.leases, size: pool.size })}
            </span>
            <div className="w-48">
              <SegmentBar
                ratio={pool.leases / pool.size}
                segments={20}
                height={6}
                label={t('ip.poolUsage', { percent: Math.round((pool.leases / pool.size) * 100) })}
                warning={0.7}
                critical={0.9}
              />
            </div>
          </div>
        ) : null}
      </header>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="font-mono text-label tracking-[0.08em] text-text-secondary uppercase">
            <th className="px-4 py-2 font-semibold">{t('ip.columns.ip')}</th>
            <th className="px-4 py-2 font-semibold">{t('ip.columns.host')}</th>
            <th className="px-4 py-2 font-semibold">{t('ip.columns.interface')}</th>
            <th className="px-4 py-2 font-semibold">{t('ip.columns.type')}</th>
            <th className="px-4 py-2 font-semibold">{t('ip.columns.status')}</th>
          </tr>
        </thead>
        <tbody>
          {plan.rows.map((row) =>
            row.type === 'address' ? (
              <tr
                key={`${row.ip}:${row.owner?.id ?? 'gw'}:${row.iface}`}
                className="border-t border-border-subtle"
              >
                <td className="px-4 py-1.5 font-mono text-data">{row.ip}</td>
                <td className="px-4 py-1.5">
                  {row.owner ? (
                    <button
                      type="button"
                      className="text-accent-text hover:underline"
                      onClick={() => select(row)}
                    >
                      {row.owner.name}
                    </button>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-1.5 font-mono text-data text-text-secondary">
                  {row.iface || '—'}
                </td>
                <td className="px-4 py-1.5 text-body-sm text-text-secondary">
                  {t(`ip.kinds.${row.kind}`)}
                </td>
                <td className="px-4 py-1.5 text-body-sm">
                  {row.conflict ? (
                    <span className="flex items-center gap-1.5 text-error-text">
                      <Led status="error" size={7} />
                      {t('ip.duplicate')}
                    </span>
                  ) : row.outside ? (
                    <span className="flex items-center gap-1.5 text-error-text">
                      <Led status="error" size={7} />
                      {t('ip.outside')}
                    </span>
                  ) : (
                    <Led status="ok" size={7} label={t('ip.ok')} />
                  )}
                </td>
              </tr>
            ) : (
              <tr key={`${row.type}:${row.from}`} className="border-t border-border-subtle">
                <td
                  colSpan={5}
                  className={`px-4 py-1.5 font-mono text-data-sm ${row.type === 'pool' ? 'text-info-text' : 'text-text-muted'}`}
                >
                  {t(row.type === 'pool' ? 'ip.poolRow' : 'ip.freeRow', {
                    from: row.from,
                    to: row.to,
                    count: row.count,
                  })}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-mono text-label font-semibold tracking-[0.08em] text-text-muted uppercase">
        {label}
      </span>
      <span className="font-mono text-data">{value}</span>
    </span>
  );
}
