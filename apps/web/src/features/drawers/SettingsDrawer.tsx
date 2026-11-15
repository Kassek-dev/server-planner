import {
  cableLabel,
  type Project,
  type ProjectSettings,
  updateProject,
} from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { CommitField, Section, useCommand } from '../inspector/parts';
import { SettingsFields } from './SettingsFields';

/** S-04 Project settings (CAP-04, SET-02 per project): thresholds, overcommit, storage reserve, money. */
export function SettingsDrawer({ project }: { project: Project }) {
  const { t } = useTranslation('drawers');
  const run = useCommand();
  const sample = Object.values(project.links).find(
    (l) => l.medium !== 'wifi' && l.medium !== 'virtual',
  );
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
      <SettingsFields
        settings={project.settings}
        onChange={(settings: Partial<ProjectSettings>) =>
          run(updateProject, { changes: { settings } })
        }
        labelExample={(pattern) => (sample ? cableLabel(project, sample, pattern) : '—')}
      />
    </>
  );
}
