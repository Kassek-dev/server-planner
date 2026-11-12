import {
  applySegmentation,
  type Project,
  planSegmentation,
  SEGMENT_PRESETS,
  SEGMENTS,
  type SegmentKey,
} from '@server-planner/model';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';
import { Select } from '../../ui/Select';
import { useCommand } from '../inspector/parts';

/** NET-10 Typical segmentation: Mgmt / LAN / IoT / Guest on a router port in one step. */
export function SegmentationDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('drawers');
  const run = useCommand();
  const routers = Object.values(project.devices)
    .filter((d) => d.kind === 'router' || d.kind === 'firewall')
    .sort((a, b) => a.name.localeCompare(b.name));
  const [routerId, setRouterId] = useState('');
  const [trunkId, setTrunkId] = useState('');
  const [chosen, setChosen] = useState<SegmentKey[]>([]);
  const router = routerId || routers[0]?.id || '';
  const plan = router ? planSegmentation(project, router) : undefined;
  const trunk = plan?.trunks.some((i) => i.id === trunkId) ? trunkId : (plan?.trunks[0]?.id ?? '');

  // Fresh choice each time: every free segment is ticked.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the dialog opens or the router changes
  useEffect(() => {
    if (open) setChosen(plan?.available ?? []);
  }, [open, router]);

  const apply = () => {
    if (!router || !trunk || chosen.length === 0) return;
    const done = run(applySegmentation, {
      routerId: router,
      trunkInterfaceId: trunk,
      segments: chosen,
    });
    if (done) onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('segmentation.title')}
      description={t('segmentation.description')}
      closeLabel={t('segmentation.cancel')}
      width={560}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('segmentation.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!router || !trunk || chosen.length === 0}
            onClick={apply}
          >
            {t('segmentation.apply', { count: chosen.length })}
          </Button>
        </>
      }
    >
      {routers.length === 0 ? (
        <p className="m-0 text-text-secondary">{t('segmentation.noRouter')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t('segmentation.router')}
              value={router}
              onChange={(e) => setRouterId(e.target.value)}
              options={routers.map((r) => ({ value: r.id, label: r.name }))}
            />
            <Select
              label={t('segmentation.trunk')}
              mono
              value={trunk}
              onChange={(e) => setTrunkId(e.target.value)}
              options={(plan?.trunks ?? []).map((i) => ({ value: i.id, label: i.name }))}
            />
          </div>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
              {t('segmentation.segments')}
            </legend>
            {SEGMENTS.map((key) => {
              const preset = SEGMENT_PRESETS[key];
              const free = plan?.available.includes(key) ?? false;
              return (
                <div key={key} className="flex flex-col gap-0.5">
                  <Checkbox
                    label={t(`segmentation.names.${key}`, { vid: preset.vid })}
                    checked={chosen.includes(key)}
                    disabled={!free}
                    onChange={(e) =>
                      setChosen((c) =>
                        e.target.checked ? [...c, key] : c.filter((k) => k !== key),
                      )
                    }
                  />
                  <span className="pl-5.5 text-body-sm text-text-secondary">
                    {free
                      ? t(`segmentation.hints.${key}`, { cidr: `192.168.${preset.vid}.0/24` })
                      : t('segmentation.taken', { vid: preset.vid })}
                  </span>
                </div>
              );
            })}
          </fieldset>
          {plan && !plan.hasWan ? (
            <p className="m-0 text-body-sm text-warning-text">{t('segmentation.noWan')}</p>
          ) : null}
        </>
      )}
    </Dialog>
  );
}
