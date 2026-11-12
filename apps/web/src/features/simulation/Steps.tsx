import type { ReachabilityResult, SimStep } from '@server-planner/engine';
import type { Project } from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { Led, type LedStatus } from '../../ui/Led';
import { targetLabel, useRevealTarget } from '../issues/navigation';

/** Step list of a reachability test (docs/04 § 6.10): number, layer badge, sentence, LED, link. */
export function StepList({ project, result }: { project: Project; result: ReachabilityResult }) {
  const { t } = useTranslation('simulation');
  const reveal = useRevealTarget(project);
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {result.steps.map((step, index) => {
        const link = step.ruleRef ?? step.ref;
        return (
          <li
            // Steps are a fixed sequence per result; the code + target identifies each one.
            key={`${step.code}:${step.ref.id}:${step.ruleRef?.id ?? ''}`}
            className="grid grid-cols-[20px_44px_1fr_10px] items-start gap-2 border-b border-border-subtle py-2"
          >
            <span className="font-mono text-data text-text-muted">{index + 1}</span>
            <span className="justify-self-start rounded-xs border border-border-default px-1 font-mono text-label font-semibold text-text-secondary">
              {t(`layers.${step.layer}`)}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span>{stepSentence(t, step)}</span>
              <button
                type="button"
                className="self-start text-body-sm text-accent-text hover:underline"
                onClick={() => reveal(link)}
              >
                {step.ruleRef
                  ? t('ruleLink', { rule: step.params.rule ?? '' })
                  : targetLabel(project, step.ref)}
              </button>
            </span>
            <span className="mt-1.5">
              <Led
                status={step.decision === 'pass' ? 'ok' : 'error'}
                label={t(step.decision === 'pass' ? 'decision.pass' : 'decision.fail')}
                size={7}
              />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

type T = ReturnType<typeof useTranslation<'simulation'>>['t'];

export const stepSentence = (t: T, step: SimStep): string => t(`steps.${step.code}`, step.params);

export const verdictLed: Record<ReachabilityResult['verdict'], LedStatus> = {
  reachable: 'ok',
  blocked: 'error',
  unknown: 'warning',
};

/** Why the result is what it is: the failing step, or the last step when everything passed. */
export function reason(t: T, result: ReachabilityResult): string {
  const step =
    result.blockedAt === undefined ? result.steps.at(-1) : result.steps[result.blockedAt];
  return step ? stepSentence(t, step) : '';
}
