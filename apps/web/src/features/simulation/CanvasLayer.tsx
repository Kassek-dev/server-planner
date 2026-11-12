import type { Protocol } from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useSession } from '../../app/services';
import { endpointName, refFor, targetFor } from './entities';
import { FlowTimeline } from './FlowTimeline';
import { ResultSummary } from './SimulationPanel';
import { useSimulation } from './store';

/** O-08 result card (top-left of the canvas) and the O-09 legend, while the simulation is open. */
export function SimulationCanvasLayer() {
  const { t } = useTranslation('simulation');
  const [params] = useSearchParams();
  const project = useSession((s) => s.project);
  const highlight = useSimulation((s) => s.highlight);
  const internetOverlay = useSimulation((s) => s.internetOverlay);
  const visible = useSimulation((s) => s.visible);
  if (!project || params.get('panel') !== 'sim') return null;

  const from = refFor(project, params.get('from'));
  const to = targetFor(project, params.get('to'));
  const port = Number(params.get('port'));
  const showCard = (params.get('sim') ?? 'reach') === 'reach' && highlight && from && to;

  return (
    <>
      {params.get('sim') === 'flows' ? <FlowTimeline /> : null}
      {showCard ? (
        <div className="absolute top-4 left-4 w-72">
          <ResultSummary
            project={project}
            result={highlight}
            from={from}
            to={to}
            protocol={(params.get('proto') as Protocol | null) ?? 'tcp'}
            {...(Number.isInteger(port) && port > 0 ? { port } : {})}
          />
        </div>
      ) : null}
      {internetOverlay || visible ? (
        <div className="absolute bottom-4 left-4 flex w-72 flex-col gap-2 rounded-md border border-border-default bg-raised px-3 py-2.5">
          {internetOverlay ? (
            <>
              <span className="font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
                {t('legend.internet')}
              </span>
              <Legend />
            </>
          ) : null}
          {visible ? (
            <>
              <span className="font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
                {t('legend.visible', { name: endpointName(project, visible.viewpoint) })}
              </span>
              <Legend />
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Legend() {
  const { t } = useTranslation('simulation');
  return (
    <span className="flex gap-3.5 text-body-sm text-text-secondary">
      <span>{`✓ ${t('coverage.full')}`}</span>
      <span>{`◐ ${t('coverage.partial')}`}</span>
      <span>{`✕ ${t('coverage.none')}`}</span>
    </span>
  );
}
