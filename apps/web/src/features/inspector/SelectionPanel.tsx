import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
} from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useServices, useSession } from '../../app/services';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { type AlignMode, alignSelection, deleteSelection } from '../canvas/actions';
import { useSelection } from '../canvas/selection';
import { Summary } from '../editor/Summary';
import { IssuesPanel } from '../issues/IssuesPanel';
import { SimulationPanel } from '../simulation/SimulationPanel';
import { AppInspector } from './AppInspector';
import { DeviceInspector } from './device/DeviceInspector';
import { LinkInspector } from './LinkInspector';
import { LocationInspector } from './LocationInspector';
import { useInspectorError } from './parts';
import { WorkloadInspector } from './WorkloadInspector';

/** Right column (304 px, docs/04 § 4.2): the inspector for the current selection (docs/05 § 5). */
export function SelectionPanel() {
  const { t } = useTranslation('inspector');
  const { session } = useServices();
  const project = useSession((s) => s.project);
  const { nodeIds, edgeIds, detail } = useSelection();
  const error = useInspectorError((s) => s.error);
  const [params, setParams] = useSearchParams();
  const issuesOpen = params.get('panel') === 'issues';
  const simOpen = params.get('panel') === 'sim';
  const closePanel = () =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      for (const key of ['panel', 'sim', 'from', 'to', 'proto', 'port', 'view', 'visible'])
        p.delete(key);
      return p;
    });

  // A message belongs to the element it was raised for.
  const key = `${nodeIds.join()}|${edgeIds.join()}|${detail?.id ?? ''}`;
  useEffect(() => {
    if (key) useInspectorError.getState().set(null);
  }, [key]);

  if (!project) return null;
  const count = nodeIds.length + edgeIds.length;
  const workload = detail?.type === 'workload' ? project.workloads[detail.id] : undefined;
  const app = detail?.type === 'app' ? project.apps[detail.id] : undefined;
  const device = nodeIds.length === 1 && nodeIds[0] ? project.devices[nodeIds[0]] : undefined;
  const location = nodeIds.length === 1 && nodeIds[0] ? project.locations[nodeIds[0]] : undefined;
  const link = count === 1 && edgeIds[0] ? project.links[edgeIds[0]] : undefined;

  let body = <Summary project={project} />;
  if (issuesOpen) body = <IssuesPanel onClose={closePanel} />;
  else if (simOpen) body = <SimulationPanel onClose={closePanel} />;
  else if (workload) body = <WorkloadInspector project={project} workload={workload} />;
  else if (app) body = <AppInspector project={project} app={app} />;
  else if (count > 1)
    body = (
      <>
        <h2 className="m-0 text-title font-semibold">{t('multi.title', { count })}</h2>
        <AlignButtons nodeIds={nodeIds} />
        <Button
          variant="danger"
          onClick={() => {
            deleteSelection(session, nodeIds, edgeIds);
            useSelection.getState().clear();
          }}
        >
          {t('multi.delete')}
        </Button>
      </>
    );
  else if (device) body = <DeviceInspector project={project} device={device} />;
  else if (location) body = <LocationInspector project={project} location={location} />;
  else if (link) body = <LinkInspector project={project} link={link} />;

  return (
    <aside
      aria-label={t('title')}
      className="flex w-76 shrink-0 flex-col gap-4 overflow-auto border-l border-border-subtle bg-panel p-4"
    >
      {error ? (
        <Banner kind="error">
          {t(`errors.${error.code}`, {
            defaultValue: t('errors.generic', { code: error.code }),
            ...error.params,
          })}
        </Banner>
      ) : null}
      {body}
    </aside>
  );
}

const ALIGN: { mode: AlignMode; icon: typeof AlignStartVertical }[] = [
  { mode: 'left', icon: AlignStartVertical },
  { mode: 'center', icon: AlignCenterVertical },
  { mode: 'right', icon: AlignEndVertical },
  { mode: 'top', icon: AlignStartHorizontal },
  { mode: 'middle', icon: AlignCenterHorizontal },
  { mode: 'bottom', icon: AlignEndHorizontal },
  { mode: 'row', icon: AlignHorizontalSpaceAround },
  { mode: 'column', icon: AlignVerticalSpaceAround },
];

/** CAN-08: align / distribute the selected devices. */
function AlignButtons({ nodeIds }: { nodeIds: string[] }) {
  const { t } = useTranslation('inspector');
  const { session } = useServices();
  return (
    <div role="toolbar" aria-label={t('multi.align')} className="flex flex-wrap gap-1">
      {ALIGN.map(({ mode, icon: Icon }) => (
        <Button
          key={mode}
          size="sm"
          aria-label={t(`multi.alignModes.${mode}`)}
          title={t(`multi.alignModes.${mode}`)}
          onClick={() => alignSelection(session, nodeIds, mode)}
        >
          <Icon size={14} aria-hidden="true" />
        </Button>
      ))}
    </div>
  );
}
