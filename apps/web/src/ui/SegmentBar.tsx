/**
 * Segmented usage bar — docs/04 § 6.9. Each filled segment takes the colour of the threshold band it
 * falls in (ok < warning ≤ critical); over 100 % the last segment gets an error outline.
 */
export interface SegmentBarProps {
  ratio: number;
  label: string;
  segments?: number;
  height?: number;
  warning: number;
  critical: number;
}

export function SegmentBar({
  ratio,
  label,
  segments = 20,
  height = 10,
  warning,
  critical,
}: SegmentBarProps) {
  const safe = Number.isFinite(ratio) ? Math.max(0, ratio) : 1.01;
  const filled = Math.min(segments, Math.ceil(safe * segments - 1e-9));
  const color = (i: number) => {
    if (i >= filled) return 'var(--sp-port-empty)';
    const at = (i + 1) / segments;
    if (at > critical) return 'var(--sp-status-error)';
    if (at > warning) return 'var(--sp-status-warning)';
    return 'var(--sp-status-ok)';
  };
  const percent = Math.round(safe * 100);
  return (
    <div>
      <meter
        className="sr-only"
        aria-label={label}
        min={0}
        max={100}
        value={Math.min(percent, 100)}
      >
        {`${percent}%`}
      </meter>
      <div
        aria-hidden="true"
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${segments}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: segments }, (_, n) => n).map((segment) => (
          <span
            key={segment}
            style={{
              height,
              background: color(segment),
              outline:
                safe > 1 && segment === segments - 1
                  ? '1px solid var(--sp-status-error)'
                  : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}
