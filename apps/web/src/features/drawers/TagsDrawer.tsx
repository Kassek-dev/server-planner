import {
  addTag,
  deleteTag,
  PALETTE_KEYS,
  type PaletteKey,
  type Project,
  updateTag,
} from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { Select } from '../../ui/Select';
import { colorOf } from '../canvas/graph';
import { AddButton, CommitField, RemoveButton, Section, useCommand } from '../inspector/parts';

/** S-03 Tags (LBL-01): name, color, usage; deleting removes the tag everywhere. */
export function TagsDrawer({ project }: { project: Project }) {
  const { t } = useTranslation('drawers');
  const run = useCommand();
  const tags = Object.values(project.tags).sort((a, b) => a.name.localeCompare(b.name));
  const tagged = [
    ...Object.values(project.devices),
    ...Object.values(project.workloads),
    ...Object.values(project.apps),
    ...Object.values(project.links),
  ];
  const usage = (id: string) => tagged.filter((x) => x.tagIds.includes(id)).length;
  return (
    <Section
      title={t('tags.count', { count: tags.length })}
      action={
        <AddButton
          label={t('tags.add')}
          onClick={() =>
            run(addTag, {
              tag: {
                name: `tag-${tags.length + 1}`,
                color: PALETTE_KEYS[tags.length % PALETTE_KEYS.length] ?? 'sky',
              },
            })
          }
        />
      }
    >
      <p className="m-0 text-body-sm text-text-muted">{t('tags.hint')}</p>
      {tags.map((tag) => (
        <fieldset
          key={tag.id}
          className="m-0 grid grid-cols-[24px_1fr_140px_90px_auto] items-end gap-2.5 border-0 p-0"
        >
          <legend className="sr-only">{tag.name}</legend>
          <span
            aria-hidden="true"
            className="mb-3 h-2.5 w-2.5 rounded-pill"
            style={{ background: colorOf(tag.color) }}
          />
          <CommitField
            label={t('tags.name')}
            value={tag.name}
            onCommit={(name) => name && run(updateTag, { id: tag.id, changes: { name } })}
          />
          <Select
            label={t('tags.color')}
            mono
            value={tag.color}
            options={PALETTE_KEYS.map((k) => ({ value: k, label: k }))}
            onChange={(e) =>
              run(updateTag, { id: tag.id, changes: { color: e.target.value as PaletteKey } })
            }
          />
          <span className="pb-2 font-mono text-data text-text-secondary">
            {t('tags.used', { count: usage(tag.id) })}
          </span>
          <RemoveButton
            label={t('actions.remove')}
            onClick={() => run(deleteTag, { id: tag.id })}
          />
        </fieldset>
      ))}
    </Section>
  );
}
