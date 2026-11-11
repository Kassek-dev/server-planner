/** Status LED — docs/04 § 6.4. Always paired with a sentence (tooltip / label), never color alone. */
export type LedStatus = 'ok' | 'warning' | 'error' | 'info' | 'off';

const fill: Record<LedStatus, string> = {
  ok: 'var(--sp-status-ok)',
  warning: 'var(--sp-status-warning)',
  error: 'var(--sp-status-error)',
  info: 'var(--sp-status-info)',
  off: 'var(--sp-status-off)',
};

export interface LedProps {
  status: LedStatus;
  /** Sentence describing the state; used as accessible name and tooltip. */
  label: string;
  size?: 7 | 8;
}

export function Led({ status, label, size = 8 }: LedProps) {
  const color = fill[status];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-block shrink-0 rounded-pill"
      style={{
        width: size,
        height: size,
        background: color,
        boxShadow:
          status === 'off'
            ? undefined
            : `0 0 var(--sp-led-glow-size) ${color}, 0 0 0 1px color-mix(in srgb, ${color} 40%, transparent)`,
      }}
    />
  );
}
