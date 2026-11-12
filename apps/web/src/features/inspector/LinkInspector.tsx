import {
  cableLabel,
  connectInterfaces,
  DEFAULT_CABLE_COLOR,
  deleteLink,
  isInterfaceFree,
  type Link,
  type Project,
  setLinkRouting,
  setLinkWaypoints,
  updateLink,
} from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { useSelection } from '../canvas/selection';
import { CommitField, Grid, Section, useCommand, useTransaction } from './parts';

const CATEGORIES = ['cat5e', 'cat6', 'cat6a', 'om3', 'os2'] as const;

/** I-05 Link (docs/05 § 5.5): ends with port choice, medium, cable details. */
export function LinkInspector({ project, link }: { project: Project; link: Link }) {
  const { t } = useTranslation('inspector');
  const run = useCommand();
  const transaction = useTransaction();
  const ends = [link.a, link.b] as const;
  const waypoints = project.layout.links[link.id]?.waypoints?.length ?? 0;

  const rewire = (which: 0 | 1, interfaceId: string) => {
    const other = ends[which === 0 ? 1 : 0];
    const id = transaction('link.rewire', (step) => {
      step(deleteLink, { id: link.id });
      return step(connectInterfaces, {
        a: which === 0 ? interfaceId : other,
        b: which === 0 ? other : interfaceId,
        medium: link.medium,
        ...(link.ssidId ? { ssidId: link.ssidId } : {}),
      });
    });
    if (id) useSelection.getState().set([], [id]);
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-title font-semibold">{t('link.title')}</h2>
        <span className="text-text-secondary">{t(`link.medium.${link.medium}`)}</span>
      </div>
      <Section title={t('link.ends')}>
        {ends.map((end, which) => {
          const iface = project.interfaces[end];
          const owner = iface ? project.devices[iface.owner.id] : undefined;
          const ports = Object.values(project.interfaces)
            .filter(
              (i) =>
                i.owner.id === iface?.owner.id &&
                i.kind === iface?.kind &&
                (i.id === end || isInterfaceFree(project, i)),
            )
            .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
          return (
            <Select
              key={end}
              label={owner?.name ?? '?'}
              mono
              value={end}
              options={ports.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(e) => rewire(which as 0 | 1, e.target.value)}
            />
          );
        })}
      </Section>
      {link.medium !== 'virtual' && link.medium !== 'wifi' ? (
        <Section title={t('link.cable')}>
          <Grid>
            <Select
              label={t('link.mediumLabel')}
              value={link.medium}
              options={(['copper', 'fiber', 'dac'] as const).map((m) => ({
                value: m,
                label: t(`link.medium.${m}`),
              }))}
              onChange={(e) =>
                run(updateLink, {
                  id: link.id,
                  changes: { medium: e.target.value as Link['medium'] },
                })
              }
            />
            <Select
              label={t('link.category')}
              mono
              value={link.cable?.category ?? ''}
              options={[
                { value: '', label: '—' },
                ...CATEGORIES.map((c) => ({ value: c, label: c })),
              ]}
              onChange={(e) =>
                run(updateLink, {
                  id: link.id,
                  changes: {
                    cable: {
                      ...link.cable,
                      category: (e.target.value || undefined) as
                        | (typeof CATEGORIES)[number]
                        | undefined,
                    },
                  },
                })
              }
            />
            <CommitField
              label={t('link.length')}
              mono
              value={link.cable?.lengthM !== undefined ? String(link.cable.lengthM) : ''}
              validate={(v) => (v === '' || Number(v) > 0 ? null : t('errors.number'))}
              onCommit={(v) =>
                run(updateLink, {
                  id: link.id,
                  changes: { cable: { ...link.cable, lengthM: v === '' ? undefined : Number(v) } },
                })
              }
            />
            <CommitField
              label={t('link.label')}
              mono
              value={link.cable?.label ?? ''}
              onCommit={(v) =>
                run(updateLink, {
                  id: link.id,
                  changes: { cable: { ...link.cable, label: v || undefined } },
                })
              }
            />
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
                {t('link.color')}
              </span>
              <input
                type="color"
                value={link.cable?.color ?? DEFAULT_CABLE_COLOR}
                onChange={(e) =>
                  run(
                    updateLink,
                    { id: link.id, changes: { cable: { ...link.cable, color: e.target.value } } },
                    { mergeKey: `cable-color:${link.id}` },
                  )
                }
                className="h-8 w-full cursor-pointer rounded-md border border-border-default bg-tile"
              />
            </label>
          </Grid>
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() =>
              run(updateLink, {
                id: link.id,
                changes: { cable: { ...link.cable, label: cableLabel(project, link) } },
              })
            }
          >
            {t('link.generateLabel')}
          </Button>
        </Section>
      ) : null}
      <Section title={t('link.drawing')}>
        <Segmented
          label={t('link.routing')}
          fill
          value={project.layout.links[link.id]?.routing ?? 'orthogonal'}
          onChange={(routing) => run(setLinkRouting, { id: link.id, routing })}
          options={[
            { value: 'orthogonal', label: t('link.orthogonal') },
            { value: 'straight', label: t('link.straight') },
          ]}
        />
        <div className="flex items-center gap-2">
          <span className="flex-1 text-body-sm text-text-secondary">
            {t('link.waypoints', { count: waypoints })}
          </span>
          {waypoints > 0 ? (
            <Button size="sm" onClick={() => run(setLinkWaypoints, { id: link.id, waypoints: [] })}>
              {t('link.clearWaypoints')}
            </Button>
          ) : null}
        </div>
      </Section>
      <Button
        variant="danger"
        onClick={() => {
          run(deleteLink, { id: link.id });
          useSelection.getState().clear();
        }}
      >
        {t('link.delete')}
      </Button>
    </>
  );
}
