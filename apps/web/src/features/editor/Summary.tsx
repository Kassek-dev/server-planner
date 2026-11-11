import type { Project } from '@server-planner/model';
import { useTranslation } from 'react-i18next';

/** I-01 Project summary (nothing selected) — counts for now; resources and issues arrive with the engines. */
export function Summary({ project }: { project: Project }) {
  const { t } = useTranslation('editor');
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
    </section>
  );
}
