import type { Issue, Severity } from '@server-planner/engine';
import { type Command, CommandError, commands } from '@server-planner/model';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices, useSession } from '../../app/services';
import { useResults } from '../../store/results';
import { Button } from '../../ui/Button';
import { Led } from '../../ui/Led';
import { Segmented } from '../../ui/Segmented';
import { useInspectorError } from '../inspector/parts';
import { targetLabel, useRevealTarget } from './navigation';

type Filter = 'all' | Severity;
const ORDER: Severity[] = ['error', 'warning', 'info'];
const LED: Record<Severity, 'error' | 'warning' | 'info'> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
};

/** X-02 Issues panel (docs/05 § 8): filters, groups by severity, target links, Fix actions. */
export function IssuesPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('issues');
  const { session } = useServices();
  const project = useSession((s) => s.project);
  const result = useResults((s) => s.result);
  const pending = useResults((s) => s.pending);
  const reveal = useRevealTarget(project);
  const [filter, setFilter] = useState<Filter>('all');
  if (!project) return null;
  const issues = result?.issues ?? [];
  const count = (s: Severity) => issues.filter((i) => i.severity === s).length;

  const fix = (issue: Issue) => {
    const command = issue.fix
      ? (commands[issue.fix.command] as Command<unknown, unknown> | undefined)
      : undefined;
    if (!command || !issue.fix) return;
    try {
      session.dispatch(command, issue.fix.payload);
    } catch (error) {
      if (error instanceof CommandError)
        useInspectorError.getState().set({ code: error.code, params: { ...error.params } });
      else throw error;
    }
  };

  const visible = ORDER.filter((s) => filter === 'all' || filter === s);
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t('panel.back')}
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-md border border-border-default text-text-primary hover:bg-tile-header"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <h2 className="m-0 text-title font-semibold">{t('panel.title')}</h2>
      </div>
      <Segmented
        label={t('panel.filter')}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('panel.all', { count: issues.length }) },
          { value: 'error', label: t('panel.errors', { count: count('error') }) },
          { value: 'warning', label: t('panel.warnings', { count: count('warning') }) },
          { value: 'info', label: t('panel.infos', { count: count('info') }) },
        ]}
      />
      {issues.length === 0 && !pending ? (
        <div className="flex items-center gap-2 text-text-secondary" role="status">
          <Led status="ok" />
          {t('panel.none')}
        </div>
      ) : null}
      {visible.map((severity) => {
        const group = issues.filter((i) => i.severity === severity);
        if (group.length === 0) return null;
        return (
          <section key={severity} className="flex flex-col">
            <h3 className="m-0 mb-1 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
              {t(`panel.group.${severity}`, { count: group.length })}
            </h3>
            {group.map((issue) => {
              const target = issue.targets[0];
              return (
                <article
                  key={`${issue.code}:${issue.targets.map((x) => x.id).join(',')}:${JSON.stringify(issue.params)}`}
                  className="flex gap-2.5 border-b border-border-subtle py-2.5"
                >
                  <span className="mt-1.25">
                    <Led status={LED[issue.severity]} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span>{t(`${issue.code}.description`, issue.params)}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-body-sm">
                      {target ? (
                        <button
                          type="button"
                          className="text-accent-text hover:underline"
                          onClick={() => reveal(target)}
                        >
                          {targetLabel(project, target)}
                        </button>
                      ) : null}
                      <span className="font-mono text-data-sm text-text-muted">{issue.code}</span>
                    </span>
                    {issue.fix ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="self-start px-0"
                        onClick={() => fix(issue)}
                      >
                        {t(`${issue.code}.fix`, issue.params)}
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>
        );
      })}
      <span className="mt-auto flex items-center gap-2 font-mono text-data-sm text-text-muted">
        <Led status={pending ? 'off' : 'ok'} size={7} />
        {pending
          ? t('panel.analysing')
          : t('panel.analysed', { ms: Math.max(1, Math.round(result?.durationMs ?? 0)) })}
      </span>
    </>
  );
}
