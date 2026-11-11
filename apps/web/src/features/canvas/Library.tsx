import { DEFAULT_FORM_FACTOR } from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { DeviceIcon, Silhouette } from '../../icons/devices';
import { DRAG_MIME, LIBRARY, type LibraryItem } from './library';

/** Left column (232 px) — docs/04 § 6.13. Drag onto the canvas, or click / Enter to add at the center. */
export function Library({ onAdd }: { onAdd: (item: LibraryItem) => void }) {
  const { t } = useTranslation('canvas');
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
                  {item.type === 'location' ? (
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
    </aside>
  );
}

export function itemLabel(t: (key: string) => string, item: LibraryItem): string {
  if (item.type === 'location') return t(`locationKind.${item.kind}`);
  return item.clientType ? t(`clientType.${item.clientType}`) : t(`deviceKind.${item.kind}`);
}
