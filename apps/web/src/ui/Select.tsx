import { type SelectHTMLAttributes, useId } from 'react';

/** Native select styled as a field (docs/04 § 6.3) — fully accessible, mono for technical values. */
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  label: string;
  options: { value: string; label: string }[];
  mono?: boolean;
  hideLabel?: boolean;
}

export function Select({
  label,
  options,
  mono = false,
  hideLabel = false,
  id,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={selectId}
        className={
          hideLabel
            ? 'sr-only'
            : 'font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase'
        }
      >
        {label}
      </label>
      <select
        id={selectId}
        className={`h-8 min-w-0 rounded-md border border-border-default bg-inset px-2 text-body text-text-primary outline-none focus:border-accent ${mono ? 'font-mono' : ''}`}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
