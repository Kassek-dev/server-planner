import type { ReactNode } from 'react';
import { Led } from './Led';

/** Message banner — docs/04 § 2.3 message colors; LED + sentence, never color alone. */
export type BannerKind = 'warning' | 'error' | 'info';

const kindClass: Record<BannerKind, string> = {
  warning: 'border-warning-border bg-warning-bg',
  error: 'border-error-border bg-error-bg',
  info: 'border-info-border bg-info-bg',
};

export function Banner({
  kind,
  children,
  actions,
}: {
  kind: BannerKind;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`flex flex-wrap items-center gap-3 rounded-md border px-3.5 py-2.5 text-text-primary ${kindClass[kind]}`}
    >
      <Led status={kind} />
      <span className="min-w-0 flex-1">{children}</span>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
