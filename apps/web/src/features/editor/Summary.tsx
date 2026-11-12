import type { Project } from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useResults } from '../../store/results';
import { Button } from '../../ui/Button';
import { Led } from '../../ui/Led';
import { useDrawer } from '../drawers/useDrawer';

/** I-01 Project summary (nothing selected) — counts for now; resources and issues arrive with the engines. */
export function Summary({ project }: { project: Project }) {
  const { t } = useTranslation('editor');
  const { open } = useDrawer();
  const navigate = useNavigate();
  const { projectId = '' } = useParams();
  const routers = Object.values(project.devices).filter((d) => d.firewall);
  const rows: [string, number][] = [
    [
      t('summary.devices'),
      Object.values(project.devices).filter((d) => d.kind !== 'internet').length,
    ],
    [t('summary.locations'), Object.keys(project.locations).length],
    [t('summary.vlans'), Object.keys(project.vlans).length],
    [t('summary.workloads'), Object.keys(project.workloads).length],
    [t('summary.apps'), Object.keys(project.apps).length],
  ];
  return (
    <section className="flex flex-col gap-3">
      <h1 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
        {t('summary.title')}
      </h1>
      <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd className="m-0 text-right font-mono text-data text-text-secondary">{value}</dd>
          </div>
        ))}
      </dl>
      <IssuesSummary />
      <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
        <h2 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
          {t('summary.manage')}
        </h2>
        <Button onClick={() => open({ kind: 'vlans' })}>{t('summary.vlans')}</Button>
        {routers.map((r) => (
          <Button key={r.id} onClick={() => open({ kind: 'firewall', deviceId: r.id })}>
            {t('summary.firewall', { name: r.name })}
          </Button>
        ))}
        <Button onClick={() => open({ kind: 'tags' })}>{t('summary.tags')}</Button>
        <Button onClick={() => open({ kind: 'settings' })}>{t('summary.settings')}</Button>
        <Button onClick={() => navigate(`/p/${projectId}/snapshots`)}>
          {t('summary.snapshots')}
        </Button>
      </div>
    </section>
  );
}

function IssuesSummary() {
  const { t } = useTranslation('editor');
  const issues = useResults((s) => s.result?.issues);
  const [, setParams] = useSearchParams();
  if (!issues) return null;
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
      <h2 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
        {t('summary.issues')}
      </h2>
      <div className="flex items-center gap-2">
        <Led status={errors ? 'error' : warnings ? 'warning' : 'ok'} />
        <span className="flex-1">{t('summary.issueCount', { errors, warnings })}</span>
        {errors + warnings > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setParams((prev) => {
                const p = new URLSearchParams(prev);
                p.set('panel', 'issues');
                return p;
              })
            }
          >
            {t('summary.showIssues')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
