import type { Node, NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Silhouette } from '../../../icons/devices';
import { RACK_HEADER, RACK_RAIL, RACK_U, rackRowTop } from '../geometry';
import type { LocationNodeData } from '../graph';

/** Location containers — docs/04 § 6.8: rack (solid frame, U rail), shelf and room (dashed). */
export const LocationNode = memo(function LocationNode({
  data,
  selected,
}: NodeProps<Node<LocationNodeData, 'location'>>) {
  const { t } = useTranslation('canvas');
  const { location, size } = data;
  const frame = selected ? 'border-2 border-selection' : 'border border-border-strong';

  if (location.kind !== 'rack') {
    return (
      <div
        className={`relative h-full rounded-md border-dashed ${frame}`}
        style={{ width: size.w }}
      >
        <div className="flex h-7 items-center gap-2 px-2.5 font-mono text-label font-semibold tracking-[0.06em] text-text-secondary uppercase">
          <Silhouette name={location.kind} size={14} />
          <span className="truncate">{location.name}</span>
        </div>
        {location.kind === 'shelf' ? (
          <span className="absolute right-2 bottom-3 left-2 h-[3px] rounded-xs bg-device-foot" />
        ) : null}
      </div>
    );
  }

  const units = Array.from({ length: location.units }, (_, i) => location.units - i);
  const occupied = new Set(
    (data.occupied ?? []).flatMap((o) =>
      Array.from({ length: o.to - o.from + 1 }, (_, i) => o.from + i),
    ),
  );
  // Contiguous runs of free units, drawn as dashed slots with "nU free".
  const freeRuns: { top: number; count: number }[] = [];
  for (const u of units) {
    if (occupied.has(u)) continue;
    const last = freeRuns.at(-1);
    if (last && last.top - last.count === u) last.count += 1;
    else freeRuns.push({ top: u, count: 1 });
  }

  return (
    <div className={`relative h-full overflow-hidden rounded-md bg-container ${frame}`}>
      <div
        className="flex items-center gap-2 bg-tile-header px-2.5 font-mono text-label font-semibold tracking-[0.06em] uppercase"
        style={{ height: RACK_HEADER }}
      >
        <Silhouette name="rack" size={14} />
        <span className="truncate">{location.name}</span>
        <span className="ml-auto font-normal text-text-secondary">{`${location.width === '10in' ? '10″' : '19″'} · ${location.units}U`}</span>
      </div>
      <div
        className="absolute left-0 border-r border-border-subtle bg-tile-header font-mono text-badge text-text-muted"
        style={{ top: RACK_HEADER, width: RACK_RAIL }}
        aria-hidden="true"
      >
        {units.map((u) => (
          <div
            key={u}
            className="text-center"
            style={{ height: RACK_U, lineHeight: `${RACK_U}px` }}
          >
            {u}
          </div>
        ))}
      </div>
      {(location.shelves ?? []).map((shelf) => (
        <div
          key={shelf.u}
          className="absolute flex items-end justify-end border-b-2 border-border-strong pr-2 pb-0.5 font-mono text-badge text-text-muted"
          style={{
            left: RACK_RAIL + 4,
            right: 8,
            top: rackRowTop(location, shelf.u + shelf.units - 1),
            height: shelf.units * RACK_U - 2,
          }}
        >
          {t('rack.shelf', { units: shelf.units })}
        </div>
      ))}
      {freeRuns.map((run) => (
        <div
          key={run.top}
          className="absolute flex items-center justify-center rounded-sm border border-dashed border-border-subtle font-mono text-data-sm text-text-muted"
          style={{
            left: RACK_RAIL + 4,
            right: 8,
            top: rackRowTop(location, run.top) + 1,
            height: run.count * RACK_U - 2,
          }}
        >
          {run.count >= 2 ? t('rack.free', { units: run.count }) : null}
        </div>
      ))}
    </div>
  );
});
