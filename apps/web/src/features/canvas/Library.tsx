import { type CatalogDevice, DEFAULT_FORM_FACTOR } from '@server-planner/model';
import { Boxes, Server, StickyNote, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices, useSession } from '../../app/services';
import { DeviceIcon, Silhouette } from '../../icons/devices';
import { AppCatalogDialog } from '../catalog/AppCatalogDialog';
import { DeviceModelPicker } from '../catalog/DeviceModelPicker';
import { defaultHost } from '../catalog/helpers';
import { useDeviceTemplates } from './deviceTemplates';
import { DRAG_MIME, LIBRARY, type LibraryItem } from './library';
import { useSelection } from './selection';

/** Left column (232 px) — docs/04 § 6.13. Drag onto the canvas, or click / Enter to add at the center. */
export function Library({
  onAdd,
  onAddModel,
}: {
  onAdd: (item: LibraryItem) => void;
  /** D-05 from the library: a catalog model added at the viewport center. */
  onAddModel: (model: CatalogDevice, catalogVersion: string) => void;
}) {
  const { t } = useTranslation('canvas');
  const project = useSession((s) => s.project);
  const [dialog, setDialog] = useState<'models' | 'apps' | null>(null);
  const { repository } = useServices();
  const templates = useDeviceTemplates((s) => s.templates);
  useEffect(() => {
    void useDeviceTemplates.getState().load(repository);
  }, [repository]);
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };
  return (
    <aside
      aria-label={t('library.title')}
      className="flex w-58 shrink-0 flex-col gap-3 overflow-auto border-r border-border-subtle bg-panel px-3 py-3.5"
    >
      <span className="font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
        {t('library.title')}
      </span>
      {LIBRARY.map((group) => (
        <section key={group.section} className="flex flex-col gap-1.5">
          <h2 className="m-0 font-mono text-badge font-semibold tracking-[0.08em] text-text-muted uppercase">
            {t(`library.sections.${group.section}`)}
          </h2>
          {group.items.map((item) => {
            const label = itemLabel(t, item);
            return (
              <button
                key={label}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onAdd(item)}
                title={t('library.addHint')}
                className={[
                  'flex h-8.5 items-center gap-2.5 rounded-md bg-tile px-2.5 text-left text-body text-text-primary',
                  'hover:border-border-strong',
                  item.type === 'location'
                    ? 'border border-dashed border-border-strong'
                    : 'border border-border-subtle',
                ].join(' ')}
              >
                <span className="text-text-secondary">
                  {item.type === 'note' ? (
                    <StickyNote size={18} aria-hidden="true" />
                  ) : item.type === 'location' ? (
                    <Silhouette name={item.kind} size={18} />
                  ) : (
                    <DeviceIcon
                      device={{
                        kind: item.kind,
                        ...(item.clientType ? { clientType: item.clientType } : {}),
                        ...(DEFAULT_FORM_FACTOR[item.kind]
                          ? { formFactor: DEFAULT_FORM_FACTOR[item.kind] }
                          : {}),
                      }}
                      size={18}
                    />
                  )}
                </span>
                <span className="truncate">{label}</span>
                <span className="ml-auto font-mono text-data-sm text-text-secondary">
                  {item.meta}
                </span>
              </button>
            );
          })}
        </section>
      ))}
      {templates.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <h2 className="m-0 font-mono text-badge font-semibold tracking-[0.08em] text-text-muted uppercase">
            {t('library.sections.templates')}
          </h2>
          {templates.map((template) => (
            <div key={template.id} className="flex items-center gap-1">
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    DRAG_MIME,
                    JSON.stringify({ type: 'template', template, meta: '' } satisfies LibraryItem),
                  );
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onAdd({ type: 'template', template, meta: '' })}
                title={t('library.addHint')}
                className={`${CATALOG_BUTTON} min-w-0 flex-1`}
              >
                <span className="text-text-secondary">
                  <DeviceIcon device={template.device} size={18} />
                </span>
                <span className="truncate">{template.name}</span>
              </button>
              <button
                type="button"
                aria-label={t('library.removeTemplate', { name: template.name })}
                onClick={() => void useDeviceTemplates.getState().remove(repository, template.id)}
                className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-tile-header hover:text-text-primary"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </section>
      ) : null}
      <section className="flex flex-col gap-1.5">
        <h2 className="m-0 font-mono text-badge font-semibold tracking-[0.08em] text-text-muted uppercase">
          {t('library.sections.catalog')}
        </h2>
        <button type="button" className={CATALOG_BUTTON} onClick={() => setDialog('models')}>
          <Server size={16} aria-hidden="true" className="text-text-secondary" />
          {t('library.browseDevices')}
        </button>
        <button type="button" className={CATALOG_BUTTON} onClick={() => setDialog('apps')}>
          <Boxes size={16} aria-hidden="true" className="text-text-secondary" />
          {t('library.browseApps')}
        </button>
      </section>
      {dialog === 'models' ? (
        <DeviceModelPicker
          open
          onOpenChange={close}
          title={t('library.browseDevices')}
          onPick={onAddModel}
        />
      ) : null}
      {dialog === 'apps' && project ? (
        <AppCatalogDialog
          project={project}
          host={defaultHost(project, undefined, useSelection.getState())}
          open
          onOpenChange={close}
        />
      ) : null}
    </aside>
  );
}

const CATALOG_BUTTON =
  'flex h-8.5 items-center gap-2.5 rounded-md border border-border-subtle bg-tile px-2.5 text-left text-body text-text-primary hover:border-border-strong';

export function itemLabel(t: (key: string) => string, item: LibraryItem): string {
  if (item.type === 'note') return t('library.note');
  if (item.type === 'template') return item.template.name;
  if (item.type === 'location') return t(`locationKind.${item.kind}`);
  return item.clientType ? t(`clientType.${item.clientType}`) : t(`deviceKind.${item.kind}`);
}
