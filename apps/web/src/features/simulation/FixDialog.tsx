import type { IssueFix } from '@server-planner/engine';
import {
  type Command,
  CommandError,
  commands,
  type Endpoint,
  type FirewallRule,
  type Project,
} from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { useServices } from '../../app/services';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { useInspectorError } from '../inspector/parts';

/** D-08 Suggest fix preview (docs/05 § 7): what changes and where, applied only on confirmation. */

interface AddRulePayload {
  deviceId: string;
  index: number;
  rule: Omit<FirewallRule, 'id'>;
}

export function endpointLabel(project: Project, e: Endpoint): string {
  switch (e.type) {
    case 'any':
      return 'any';
    case 'internet':
      return 'Internet';
    case 'cidr':
      return e.value;
    case 'zone':
      return project.zones[e.id]?.name ?? '?';
    case 'subnet':
      return project.subnets[e.id]?.cidr ?? '?';
    case 'device':
      return project.devices[e.id]?.name ?? '?';
    case 'workload':
      return project.workloads[e.id]?.name ?? '?';
    case 'app':
      return project.apps[e.id]?.name ?? '?';
  }
}

export function FixDialog({
  project,
  fix,
  open,
  onOpenChange,
}: {
  project: Project;
  fix: IssueFix;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('simulation');
  const { session } = useServices();
  const payload = fix.payload as AddRulePayload;
  const router = project.devices[payload.deviceId];
  const rules = router?.firewall?.rules ?? [];
  const { rule } = payload;
  const port = rule.ports?.[0];
  const service =
    rule.protocol === 'any'
      ? 'any'
      : port
        ? `${rule.protocol}/${port.from === port.to ? port.from : `${port.from}-${port.to}`}`
        : rule.protocol;
  const values = {
    router: router?.name ?? '?',
    source: endpointLabel(project, rule.source),
    destination: endpointLabel(project, rule.destination),
    service,
    position: payload.index + 1,
  };

  const apply = () => {
    const command = commands[fix.command] as Command<unknown, unknown> | undefined;
    if (!command) return;
    try {
      session.dispatch(command, fix.payload);
      onOpenChange(false);
    } catch (error) {
      if (!(error instanceof CommandError)) throw error;
      useInspectorError.getState().set({ code: error.code, params: { ...error.params } });
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('fix.title')}
      description={t('fix.description', values)}
      closeLabel={t('fix.cancel')}
      width={560}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('fix.cancel')}</Button>
          <Button variant="primary" onClick={apply}>
            {t('fix.apply')}
          </Button>
        </>
      }
    >
      <ol className="m-0 flex list-none flex-col rounded-md border border-border-subtle p-0 font-mono text-data">
        {[...rules.slice(0, payload.index), null, ...rules.slice(payload.index)].map((r, i) =>
          r ? (
            <li
              key={r.id}
              className="flex gap-3 border-b border-border-subtle px-3 py-1.5 text-text-secondary last:border-b-0"
            >
              <span className="w-6">{i + 1}</span>
              <span className="w-12 uppercase">{r.action}</span>
              <span className="truncate">{`${endpointLabel(project, r.source)} → ${endpointLabel(project, r.destination)}`}</span>
            </li>
          ) : (
            <li
              key="new"
              className="flex gap-3 border-b border-accent bg-accent-subtle px-3 py-1.5 text-text-primary last:border-b-0"
            >
              <span className="w-6">{i + 1}</span>
              <span className="w-12 uppercase">{rule.action}</span>
              <span className="truncate">{`${values.source} → ${values.destination} · ${service}`}</span>
            </li>
          ),
        )}
      </ol>
    </Dialog>
  );
}
