import { DEFAULT_CABLE_PATTERN, type ProjectSettings } from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { CommitField, Grid, Section } from '../inspector/parts';

const percent = (v: number) => String(Math.round(v * 100));

/**
 * Capacity, costs and label fields of project settings — edited per project (S-04) and as the
 * defaults for new projects (Settings › Units & costs, SET-02).
 */
export function SettingsFields({
  settings: s,
  onChange: set,
  labelExample,
}: {
  settings: ProjectSettings;
  onChange: (settings: Partial<ProjectSettings>) => void;
  /** Sample cable label for a pattern (undefined = default pattern). */
  labelExample: (pattern: string | undefined) => string;
}) {
  const { t } = useTranslation('drawers');
  const pct = (min: number, max: number) => (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? null : t('errors.percent', { min, max });
  };
  const ratio = (v: string) => (Number(v) > 0 && Number(v) <= 32 ? null : t('errors.ratio'));

  return (
    <>
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
      <Section title={t('settings.labels')}>
        <CommitField
          label={t('settings.cablePattern')}
          mono
          value={s.cableLabelPattern ?? DEFAULT_CABLE_PATTERN}
          validate={(v) => (v.trim() && v.length <= 120 ? null : t('errors.pattern'))}
          onCommit={(v) =>
            set({
              cableLabelPattern:
                v.trim() === DEFAULT_CABLE_PATTERN || !v.trim() ? undefined : v.trim(),
            })
          }
        />
        <p className="m-0 text-body-sm text-text-muted">
          {t('settings.cablePatternHint', {
            example: labelExample(s.cableLabelPattern),
          })}
        </p>
      </Section>
    </>
  );
}
