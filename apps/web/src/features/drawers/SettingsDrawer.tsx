import { type Project, updateProject } from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { CommitField, Grid, Section, useCommand } from '../inspector/parts';

const percent = (v: number) => String(Math.round(v * 100));

/** S-04 Project settings (CAP-04, SET-02 per project): thresholds, overcommit, storage reserve, money. */
export function SettingsDrawer({ project }: { project: Project }) {
  const { t } = useTranslation('drawers');
  const run = useCommand();
  const s = project.settings;
  const set = (settings: Partial<typeof s>) => run(updateProject, { changes: { settings } });
  const pct = (min: number, max: number) => (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? null : t('errors.percent', { min, max });
  };
  const ratio = (v: string) => (Number(v) > 0 && Number(v) <= 32 ? null : t('errors.ratio'));

  return (
    <>
      <Section title={t('settings.project')}>
        <CommitField
          label={t('settings.name')}
          value={project.name}
          onCommit={(name) => name && run(updateProject, { changes: { name } })}
        />
        <CommitField
          label={t('settings.description')}
          value={project.description ?? ''}
          onCommit={(description) =>
            run(updateProject, { changes: { description: description || undefined } })
          }
        />
      </Section>
      <Section title={t('settings.capacity')}>
        <Grid>
          <CommitField
            label={t('settings.warning')}
            mono
            value={percent(s.capacityThresholds.warning)}
            validate={(v) =>
              pct(1, 99)(v) ??
              (Number(v) / 100 >= s.capacityThresholds.critical
                ? t('errors.warningBelowCritical')
                : null)
            }
            onCommit={(v) =>
              set({ capacityThresholds: { ...s.capacityThresholds, warning: Number(v) / 100 } })
            }
          />
          <CommitField
            label={t('settings.critical')}
            mono
            value={percent(s.capacityThresholds.critical)}
            validate={(v) =>
              pct(1, 100)(v) ??
              (Number(v) / 100 <= s.capacityThresholds.warning
                ? t('errors.warningBelowCritical')
                : null)
            }
            onCommit={(v) =>
              set({ capacityThresholds: { ...s.capacityThresholds, critical: Number(v) / 100 } })
            }
          />
          <CommitField
            label={t('settings.cpuOvercommit')}
            mono
            value={String(s.defaultOvercommit.cpu)}
            validate={ratio}
            onCommit={(v) => set({ defaultOvercommit: { ...s.defaultOvercommit, cpu: Number(v) } })}
          />
          <CommitField
            label={t('settings.memoryOvercommit')}
            mono
            value={String(s.defaultOvercommit.memory)}
            validate={ratio}
            onCommit={(v) =>
              set({ defaultOvercommit: { ...s.defaultOvercommit, memory: Number(v) } })
            }
          />
          <CommitField
            label={t('settings.storageReserve')}
            mono
            value={percent(s.storageFreeReserve)}
            validate={pct(0, 90)}
            onCommit={(v) => set({ storageFreeReserve: Number(v) / 100 })}
          />
        </Grid>
        <p className="m-0 text-body-sm text-text-muted">{t('settings.capacityHint')}</p>
      </Section>
      <Section title={t('settings.costs')}>
        <Grid>
          <CommitField
            label={t('settings.currency')}
            mono
            value={s.currency}
            validate={(v) => (/^[A-Z]{3}$/.test(v.trim()) ? null : t('errors.currency'))}
            onCommit={(v) => set({ currency: v.trim() })}
          />
          <CommitField
            label={t('settings.energyPrice')}
            mono
            value={s.energyPrice ? String(s.energyPrice.perKwh) : ''}
            validate={(v) => (v === '' || Number(v) >= 0 ? null : t('errors.ratio'))}
            onCommit={(v) =>
              set({
                energyPrice: v === '' ? undefined : { perKwh: Number(v), currency: s.currency },
              })
            }
          />
        </Grid>
      </Section>
    </>
  );
}
