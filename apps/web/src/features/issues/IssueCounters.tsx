import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useResults } from '../../store/results';
import { Led } from '../../ui/Led';

const NO_ISSUES: never[] = [];

/** Top bar issue counters (docs/05 § 3) — open the Issues panel. */
export function IssueCounters() {
  const { t } = useTranslation('issues');
  const [, setParams] = useSearchParams();
  const issues = useResults((s) => s.result?.issues) ?? NO_ISSUES;
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  return (
    <button
      type="button"
      aria-label={t('counters.label', { errors, warnings })}
      onClick={() =>
        setParams((prev) => {
          const p = new URLSearchParams(prev);
          p.set('panel', 'issues');
          return p;
        })
      }
      className="flex h-8 items-center gap-3 rounded-md px-2 font-mono text-data hover:bg-tile-header"
    >
      <span
        className={`flex items-center gap-1.5 ${errors ? 'text-error-text' : 'text-text-muted'}`}
      >
        <Led status={errors ? 'error' : 'off'} />
        {errors}
      </span>
      <span
        className={`flex items-center gap-1.5 ${warnings ? 'text-warning-text' : 'text-text-muted'}`}
      >
        <Led status={warnings ? 'warning' : 'off'} />
        {warnings}
      </span>
    </button>
  );
}
