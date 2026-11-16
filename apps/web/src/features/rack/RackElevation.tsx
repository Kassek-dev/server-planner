import { forwardRef } from 'react';
import type { Elevation } from './elevation';

/** Colours of the drawing — CSS variables in the app, resolved values in a downloaded file. */
export interface ElevationColors {
  paper: string;
  frame: string;
  rail: string;
  text: string;
  muted: string;
  device: string;
  deviceEdge: string;
  shelf: string;
  free: string;
  font: string;
}

export const TOKEN_COLORS: Record<keyof ElevationColors, string> = {
  paper: '--sp-bg-panel',
  frame: '--sp-border-strong',
  rail: '--sp-bg-tile-header',
  text: '--sp-text-primary',
  muted: '--sp-text-muted',
  device: '--sp-bg-tile',
  deviceEdge: '--sp-border-default',
  shelf: '--sp-device-foot',
  free: '--sp-border-subtle',
  font: '--sp-font-mono',
};

/** The colours as `var(--sp-…)` references, for drawing inside the app. */
export const cssColors = Object.fromEntries(
  Object.entries(TOKEN_COLORS).map(([key, token]) => [key, `var(${token})`]),
) as unknown as ElevationColors;

/** Real proportions in millimetres: 1U = 44.45 mm, panel 482.6 mm (19″) or 254 mm (10″). */
const U = 44.45;
const RAIL = 22;
const HEADER = 30;
const FOOTER = 14;

export const elevationSize = (e: Elevation) => {
  const panel = e.width === '10in' ? 254 : 482.6;
  return { width: panel + 2 * RAIL, height: HEADER + e.units * U + FOOTER, panel };
};

/**
 * LOC-09 front view of a rack as SVG (React elements, so names from the project are text, never
 * markup). Units are numbered on both rails; devices show name and detail, shelves what stands on
 * them, free runs a dashed outline.
 */
export const RackElevation = forwardRef<
  SVGSVGElement,
  { elevation: Elevation; colors: ElevationColors; label: string; freeLabel: (n: number) => string }
>(function RackElevation({ elevation: e, colors: c, label, freeLabel }, ref) {
  const { width, height, panel } = elevationSize(e);
  const y = (top: number) => HEADER + (e.units - top) * U;
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      fontFamily={c.font}
      // The whole rack fits the dialog: scaled by height, never wider than the dialog.
      className="mx-auto block h-[56vh] w-auto max-w-full"
    >
      <rect x={0} y={0} width={width} height={height} fill={c.paper} />
      <text x={RAIL} y={20} fontSize={14} fontWeight={600} fill={c.text}>
        {`${e.name} · ${e.width === '10in' ? '10″' : '19″'} · ${e.units}U`}
      </text>
      <rect
        x={RAIL}
        y={HEADER}
        width={panel}
        height={e.units * U}
        fill="none"
        stroke={c.frame}
        strokeWidth={1.5}
      />
      {Array.from({ length: e.units }, (_, i) => e.units - i).map((u) => (
        <g key={u} fill={c.muted} fontSize={9}>
          <rect x={0} y={y(u)} width={RAIL} height={U} fill={c.rail} />
          <rect x={RAIL + panel} y={y(u)} width={RAIL} height={U} fill={c.rail} />
          <text x={RAIL / 2} y={y(u) + U / 2 + 3} textAnchor="middle">
            {u}
          </text>
          <text x={RAIL * 1.5 + panel} y={y(u) + U / 2 + 3} textAnchor="middle">
            {u}
          </text>
        </g>
      ))}
      {e.items.map((item) => {
        const top = y(item.top) + 1.5;
        const h = item.units * U - 3;
        const x = RAIL + 3;
        const w = panel - 6;
        if (item.kind === 'free')
          return (
            <g key={`free-${item.top}`}>
              <rect
                x={x}
                y={top}
                width={w}
                height={h}
                fill="none"
                stroke={c.free}
                strokeDasharray="6 4"
              />
              <text
                x={x + w / 2}
                y={top + h / 2 + 4}
                textAnchor="middle"
                fontSize={11}
                fill={c.muted}
              >
                {freeLabel(item.units)}
              </text>
            </g>
          );
        if (item.kind === 'shelf')
          return (
            <g key={`shelf-${item.top}`}>
              <rect x={x} y={top + h - 4} width={w} height={4} fill={c.shelf} />
              <text x={x + 8} y={top + h / 2 + 2} fontSize={11} fill={c.text}>
                {item.devices.length > 0 ? item.devices.join(' · ') : '—'}
              </text>
            </g>
          );
        return (
          <g key={item.deviceId}>
            <rect x={x} y={top} width={w} height={h} rx={2} fill={c.device} stroke={c.deviceEdge} />
            <text x={x + 10} y={top + h / 2 + 4} fontSize={12} fontWeight={600} fill={c.text}>
              {item.name}
            </text>
            <text x={x + w - 10} y={top + h / 2 + 4} fontSize={10} textAnchor="end" fill={c.muted}>
              {`${item.detail}${item.detail ? ' · ' : ''}${item.units}U`}
            </text>
          </g>
        );
      })}
    </svg>
  );
});
