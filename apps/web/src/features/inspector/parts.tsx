import { type Command, CommandError } from '@server-planner/model';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { useServices } from '../../app/services';
import { TextField, type TextFieldProps } from '../../ui/TextField';

/** Building blocks shared by inspector panels (docs/04 § 6.11, docs/05 § 5). */

/** Last rejected command in the inspector, shown as one message at the top of the panel. */
export const useInspectorError = create<{
  error: { code: string; params: Record<string, string | number> } | null;
  set(error: { code: string; params: Record<string, string | number> } | null): void;
}>((set) => ({ error: null, set: (error) => set({ error }) }));

/** Runs a model command through the session; rejections become a translated inspector message. */
export function useCommand() {
  const { session } = useServices();
  return <P, R>(
    command: Command<P, R>,
    payload: P,
    options?: { mergeKey?: string },
  ): R | undefined => {
    try {
      const result = session.dispatch(command, payload, options);
      useInspectorError.getState().set(null);
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        useInspectorError.getState().set({ code: error.code, params: { ...error.params } });
        return undefined;
      }
      throw error;
    }
  };
}

export function useTransaction() {
  const { session } = useServices();
  return <T,>(label: string, fn: Parameters<typeof session.transaction<T>>[1]): T | undefined => {
    try {
      const result = session.transaction(label, fn);
      useInspectorError.getState().set(null);
      return result;
    } catch (error) {
      if (error instanceof CommandError) {
        useInspectorError.getState().set({ code: error.code, params: { ...error.params } });
        return undefined;
      }
      throw error;
    }
  };
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-border-subtle pt-3.5">
      <div className="flex items-center gap-2">
        <h3 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
          {title}
        </h3>
        <div className="grow" />
        {action}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-data text-text-secondary">
        {value}
      </span>
    </div>
  );
}

export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return (
    <div className={`grid gap-2.5 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>{children}</div>
  );
}

/** Text field that keeps a local draft and commits on blur / Enter (one undo step per edit). */
export function CommitField({
  value,
  onCommit,
  validate,
  ...rest
}: Omit<TextFieldProps, 'value' | 'onChange' | 'onBlur' | 'onKeyDown' | 'error'> & {
  value: string;
  onCommit: (value: string) => void;
  /** Returns an error message, or null when valid. */
  validate?: (value: string) => string | null;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(value);
    setError(null);
  }, [value]);
  const commit = () => {
    if (draft === value) return;
    const problem = validate?.(draft) ?? null;
    setError(problem);
    if (!problem) onCommit(draft);
  };
  return (
    <TextField
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setDraft(value);
          setError(null);
        }
      }}
      {...(error ? { error } : {})}
    />
  );
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 items-center gap-1 rounded-md px-2 text-body-sm font-medium text-accent-text hover:bg-tile-header"
    >
      <Plus size={14} aria-hidden="true" />
      {label}
    </button>
  );
}

export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-tile-header hover:text-error-text"
    >
      <Trash2 size={14} aria-hidden="true" />
    </button>
  );
}

/** A bordered list entry (workload row, interface, module…). */
export function Card({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div
      {...(label ? { role: 'group', 'aria-label': label } : {})}
      className="flex flex-col gap-2.5 rounded-md border border-border-subtle bg-tile p-2.5"
    >
      {children}
    </div>
  );
}

/** Row that opens a nested entity (workload / app) in the inspector. */
export function OpenRow({
  badge,
  name,
  meta,
  onOpen,
}: {
  badge: string;
  name: string;
  meta?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-md border border-border-subtle bg-tile px-2.5 py-2 text-left hover:border-border-strong"
    >
      <span className="rounded-sm bg-text-secondary px-1 font-mono text-badge font-semibold text-app">
        {badge}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      {meta ? <span className="font-mono text-data-sm text-text-secondary">{meta}</span> : null}
      <ChevronRight size={14} aria-hidden="true" className="text-text-muted" />
    </button>
  );
}

export function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  const { t } = useTranslation('inspector');
  return (
    <nav
      aria-label={t('breadcrumb')}
      className="flex flex-wrap items-center gap-1 font-mono text-data-sm text-text-muted"
    >
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <span aria-hidden="true">›</span> : null}
          {item.onClick ? (
            <button
              type="button"
              onClick={item.onClick}
              className="text-accent-text hover:underline"
            >
              {item.label}
            </button>
          ) : (
            <span>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export const intValidator = (min: number, max: number, message: string) => (value: string) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? null : message;
};
