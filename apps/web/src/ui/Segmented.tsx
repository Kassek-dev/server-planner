import { useId } from 'react';

/** Segmented control (docs/04 § 6.2) — native radio group; `fill` marks binary form choices with the accent. */
export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  fill?: boolean;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  fill = false,
}: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className="m-0 flex overflow-hidden rounded-md border border-border-default p-0">
      <legend className="sr-only">{label}</legend>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <label
            key={o.value}
            className={[
              'flex h-8 flex-1 cursor-pointer items-center justify-center px-2.5 text-body',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-focus-ring',
              i > 0 ? 'border-l border-border-default' : '',
              active
                ? fill
                  ? 'bg-accent font-semibold text-on-accent'
                  : 'bg-tile-header font-medium text-text-primary'
                : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={active}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        );
      })}
    </fieldset>
  );
}
