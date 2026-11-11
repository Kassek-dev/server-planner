import type { ProjectPreview as Preview } from '../canvas/preview';

/** Schematic thumbnail drawn from layout data (no screenshot, CSP-safe). */
export function ProjectPreview({ preview }: { preview?: Preview | undefined }) {
  const grid = {
    backgroundImage:
      'linear-gradient(var(--sp-canvas-grid) 1px, transparent 1px), linear-gradient(90deg, var(--sp-canvas-grid) 1px, transparent 1px)',
    backgroundSize: '16px 16px',
  };
  return (
    <div aria-hidden="true" className="h-36 border-b border-border-subtle bg-canvas" style={grid}>
      {preview ? (
        <svg
          viewBox={`-16 -16 ${preview.w + 32} ${preview.h + 32}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          className="h-full w-full"
        >
          {preview.items.map((item) => (
            <rect
              key={`${item.kind}-${item.x}-${item.y}`}
              x={item.x}
              y={item.y}
              width={item.w}
              height={item.h}
              rx={item.kind === 'device' ? 4 : 3}
              fill={
                item.kind === 'device'
                  ? 'var(--sp-bg-tile)'
                  : item.kind === 'rack'
                    ? 'var(--sp-bg-container)'
                    : 'none'
              }
              stroke={
                item.kind === 'device' ? 'var(--sp-border-default)' : 'var(--sp-border-strong)'
              }
              strokeWidth={item.kind === 'device' ? 3 : 4}
              strokeDasharray={item.kind === 'room' || item.kind === 'shelf' ? '12 8' : undefined}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      ) : null}
    </div>
  );
}
