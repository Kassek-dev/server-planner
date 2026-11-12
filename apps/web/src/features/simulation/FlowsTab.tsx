import type { Project } from '@server-planner/model';
import { Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices } from '../../app/services';
import { useCatalog } from '../../catalog/store';
import { Button } from '../../ui/Button';
import { Led } from '../../ui/Led';
import { Select } from '../../ui/Select';
import { endpointName } from './entities';
import { candidates, defaultBindings, flowApps, targetOf } from './flows';
import { reason, verdictLed } from './Steps';
import { useSimulation } from './store';

/** X-01c Flows (FLW-01…05): pick an app process and its participants, run, step through hops. */
export function FlowsTab({ project }: { project: Project }) {
  const { t } = useTranslation('simulation');
  const { simulator } = useServices();
  const catalog = useCatalog((s) => s.catalog);
  const flow = useSimulation((s) => s.flow);
  const apps = useMemo(() => flowApps(project, catalog), [project, catalog]);
  const [appId, setAppId] = useState('');
  const [flowId, setFlowId] = useState('');
  const [picks, setPicks] = useState<Record<string, string>>({});
  useEffect(() => {
    void useCatalog.getState().load();
    return () => useSimulation.setState({ flow: null, highlight: null });
  }, []);

  const selected = apps.find((a) => a.app.id === appId) ?? apps[0];
  const process = selected?.entry.flows.find((f) => f.id === flowId) ?? selected?.entry.flows[0];
  const defaults = selected && process ? defaultBindings(project, catalog, process, selected) : {};
  const value = (key: string) => picks[key] ?? defaults[key] ?? '';

  if (apps.length === 0) return <p className="m-0 text-text-secondary">{t('flows.none')}</p>;

  const run = async () => {
    if (!selected || !process) return;
    const bindings = Object.fromEntries(
      process.roles.map((r) => [
        r.key,
        targetOf(project, catalog, process, selected, r.key, value(r.key)),
      ]),
    );
    const result = await simulator.runFlow(project, { flow: process, bindings });
    const labels = result.hops.map((h) => {
      const service = h.port ? `${h.protocol}/${h.port}` : h.protocol;
      const prefix = h.kind === 'dns' ? `${t('flows.dns')} · ` : '';
      return `${prefix}${endpointName(project, h.from)} → ${endpointName(project, h.to)} · ${service}`;
    });
    useSimulation.setState({ flow: { run: result, labels, index: 0, playing: false } });
    useSimulation.getState().showHop(0, true);
  };

  return (
    <div className="flex flex-col gap-4">
      <Select
        label={t('flows.app')}
        value={selected?.app.id ?? ''}
        onChange={(e) => {
          setAppId(e.target.value);
          setFlowId('');
          setPicks({});
        }}
        options={apps.map((a) => ({ value: a.app.id, label: a.app.name }))}
      />
      <Select
        label={t('flows.process')}
        value={process?.id ?? ''}
        onChange={(e) => {
          setFlowId(e.target.value);
          setPicks({});
        }}
        options={(selected?.entry.flows ?? []).map((f) => ({ value: f.id, label: f.name.en }))}
      />
      {process?.roles
        .filter((r) => r.userPicks)
        .map((role) => {
          const list = selected ? candidates(project, catalog, role.selector, selected) : [];
          const optional = process.steps.every(
            (s) => (s.from !== role.key && s.to !== role.key) || s.optional,
          );
          return (
            <Select
              key={role.key}
              label={role.name.en}
              value={value(role.key)}
              onChange={(e) => setPicks((cur) => ({ ...cur, [role.key]: e.target.value }))}
              options={[
                { value: '', label: optional ? t('flows.skip') : t('flows.nobody') },
                ...list.map((c) => ({ value: c.value, label: c.label })),
              ]}
            />
          );
        })}
      <Button
        variant="primary"
        icon={<Play size={14} aria-hidden="true" />}
        onClick={() => void run()}
      >
        {t('flows.run')}
      </Button>

      {flow ? (
        <section className="flex flex-col gap-1" aria-live="polite">
          <h3 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
            {t(`flows.verdict.${flow.run.verdict}`, { count: flow.run.hops.length })}
          </h3>
          <ol className="m-0 flex list-none flex-col p-0">
            {flow.run.hops.map((hop, i) => (
              <li key={`${hop.step}:${hop.kind}`}>
                <button
                  type="button"
                  aria-current={i === flow.index ? 'step' : undefined}
                  onClick={() => useSimulation.getState().showHop(i, false)}
                  className={`grid w-full grid-cols-[20px_1fr_10px] items-start gap-2 border-b border-border-subtle py-2 text-left ${i === flow.index ? 'bg-accent-subtle' : 'hover:bg-tile'}`}
                >
                  <span className="font-mono text-data text-text-muted">{i + 1}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate">{flow.labels[i]}</span>
                    <span className="text-body-sm text-text-secondary">
                      {reason(t, hop.result)}
                    </span>
                  </span>
                  <span className="mt-1.5">
                    <Led
                      status={verdictLed[hop.result.verdict]}
                      size={7}
                      label={t(`verdict.${hop.result.verdict}`)}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {flow.run.skipped.length > 0 ? (
            <p className="m-0 text-body-sm text-text-muted">
              {t('flows.skipped', { count: flow.run.skipped.length })}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
