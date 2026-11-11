import { type KeyboardEvent, type ReactNode, useId, useRef } from 'react';

/** Inspector tabs (docs/04 § 6.2): equal columns, active = tile-header + 2 px accent bar; arrow keys move. */
export interface TabsProps<T extends string> {
  label: string;
  value: T;
  tabs: { value: T; label: string }[];
  onChange: (value: T) => void;
  children: ReactNode;
}

export function Tabs<T extends string>({ label, value, tabs, onChange, children }: TabsProps<T>) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (event: KeyboardEvent, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + tabs.length) % tabs.length;
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.value);
    refs.current[next]?.focus();
  };
  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={label}
        className="grid rounded-md border border-border-subtle"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab, i) => {
          const active = tab.value === value;
          return (
            <button
              key={tab.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-${tab.value}`}
              aria-selected={active}
              aria-controls={`${base}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(tab.value)}
              onKeyDown={(e) => onKey(e, i)}
              className={`py-1.5 text-body ${active ? 'border-b-2 border-accent bg-tile-header font-medium' : 'text-text-secondary hover:text-text-primary'}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-${value}`}
        className="flex flex-col gap-4"
      >
        {children}
      </div>
    </div>
  );
}
