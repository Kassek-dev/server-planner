import { COMPUTE_KINDS, type Device, type Project, updateDevice } from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useServices } from '../../../app/services';
import { Button } from '../../../ui/Button';
import { Checkbox } from '../../../ui/Checkbox';
import { Tabs } from '../../../ui/Tabs';
import { deleteSelection } from '../../canvas/actions';
import { useSelection } from '../../canvas/selection';
import { CommitField, useCommand } from '../parts';
import { HardwareTab } from './HardwareTab';
import { NetworkTab } from './NetworkTab';
import { SoftwareTab } from './SoftwareTab';

type Tab = 'hardware' | 'software' | 'network';

/**
 * I-02 Device (docs/05 § 5.2). Tabs Hardware / Software / Network; the Capacity tab arrives with the
 * capacity engine (stage 5). The active tab is kept in `?tab=` (docs/07 § 0).
 */
export function DeviceInspector({ project, device }: { project: Project; device: Device }) {
  const { t } = useTranslation('inspector');
  const { session } = useServices();
  const run = useCommand();
  const [params, setParams] = useSearchParams();
  const compute = COMPUTE_KINDS.includes(device.kind);
  const clientType = device.clientType ?? 'other';
  const tabs: { value: Tab; label: string }[] = [
    { value: 'hardware', label: t('tabs.hardware') },
    ...(compute ? [{ value: 'software' as const, label: t('tabs.software') }] : []),
    { value: 'network', label: t('tabs.network') },
  ];
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = tabs.some((x) => x.value === requested)
    ? (requested as Tab)
    : compute
      ? 'hardware'
      : 'network';
  const setTab = (next: Tab) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', next);
        return p;
      },
      { replace: true },
    );

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-title font-semibold">{device.name}</h2>
        <span className="text-text-secondary">
          {device.kind === 'client'
            ? t(`clientType.${clientType}`)
            : t(`deviceKind.${device.kind}`)}
        </span>
      </div>
      <CommitField
        label={t('device.name')}
        value={device.name}
        onCommit={(name) => name && run(updateDevice, { id: device.id, changes: { name } })}
      />
      <TagPicker project={project} device={device} />
      {device.kind === 'internet' ? (
        <p className="m-0 text-text-secondary">{t('device.internetHint')}</p>
      ) : (
        <Tabs label={t('tabs.label')} value={tab} tabs={tabs} onChange={setTab}>
          {tab === 'hardware' ? <HardwareTab project={project} device={device} /> : null}
          {tab === 'software' ? <SoftwareTab project={project} device={device} /> : null}
          {tab === 'network' ? <NetworkTab project={project} device={device} /> : null}
        </Tabs>
      )}
      <Button
        variant="danger"
        onClick={() => {
          deleteSelection(session, [device.id], []);
          useSelection.getState().clear();
        }}
      >
        {t('device.delete')}
      </Button>
    </>
  );
}

/** LBL-01: assign project tags to the device. */
function TagPicker({ project, device }: { project: Project; device: Device }) {
  const { t } = useTranslation('inspector');
  const run = useCommand();
  const tags = Object.values(project.tags);
  if (tags.length === 0) return null;
  return (
    <fieldset className="m-0 flex flex-wrap gap-x-4 gap-y-1 border-0 p-0">
      <legend className="mb-1.5 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
        {t('device.tags')}
      </legend>
      {tags.map((tag) => (
        <Checkbox
          key={tag.id}
          label={tag.name}
          checked={device.tagIds.includes(tag.id)}
          onChange={(e) =>
            run(updateDevice, {
              id: device.id,
              changes: {
                tagIds: e.target.checked
                  ? [...device.tagIds, tag.id]
                  : device.tagIds.filter((x) => x !== tag.id),
              },
            })
          }
        />
      ))}
    </fieldset>
  );
}
