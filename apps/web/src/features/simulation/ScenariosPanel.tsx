import type { LoadItem, ScenarioLoad } from '@server-planner/engine';
import {
  addFlowScenario,
  addFlowScenarioItem,
  cableLabel,
  deleteFlowScenario,
  type FlowBinding,
  type FlowScenario,
  type Project,
  removeFlowScenarioItem,
  renameFlowScenario,
  setFlowScenarioItemCount,
} from '@server-planner/model';
import { Gauge, ListPlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices } from '../../app/services';
import { useCatalog } from '../../catalog/store';
import { Button } from '../../ui/Button';
import { Led } from '../../ui/Led';
import { Select } from '../../ui/Select';
import { TextField } from '../../ui/TextField';
import { endpointName } from './entities';
import { flowApps } from './flows';
import { useSimulation } from './store';

const NEW = '__new';

const formatMbps = (mbps: number) =>
  mbps >= 1000
    ? `${(mbps / 1000).toFixed(mbps % 1000 === 0 ? 0 : 1)} Gb/s`
    : `${Math.round(mbps)} Mb/s`;

/** "Add to scenario" next to Run: the current process with its participants. */
export function AddToScenario({
  project,
  item,
}: {
  project: Project;
  item: FlowScenario['items'][number] | undefined;
}) {
  const { t } = useTranslation('simulation');
  const { session } = useServices();
  const scenarios = Object.values(project.flowScenarios);
  const [target, setTarget] = useState(scenarios[0]?.id ?? NEW);
  const chosen = scenarios.some((s) => s.id === target) ? target : NEW;
  const add = () => {
    if (!item) return;
    session.transaction(t('scenarios.add'), (run) => {
      const id =
        chosen === NEW
          ? run(addFlowScenario, { name: t('scenarios.defaultName', { n: scenarios.length + 1 }) })
          : chosen;
      run(addFlowScenarioItem, { id, item });
      setTarget(id);
    });
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
      <Select
        label={t('scenarios.target')}
        value={chosen}
        options={[
          ...scenarios.map((s) => ({ value: s.id, label: s.name })),
          { value: NEW, label: t('scenarios.new') },
        ]}
        onChange={(e) => setTarget(e.target.value)}
      />
      <Button disabled={!item} icon={<ListPlus size={14} aria-hidden="true" />} onClick={add}>
        {t('scenarios.add')}
      </Button>
    </div>
  );
}

/** FLW-07: saved scenarios — processes × count — and their load on the cables. */
export function ScenariosPanel({ project }: { project: Project }) {
  const { t } = useTranslation('simulation');
  const { session, simulator } = useServices();
  const catalog = useCatalog((s) => s.catalog);
  const [result, setResult] = useState<{ id: string; load: ScenarioLoad } | null>(null);
  const scenarios = Object.values(project.flowScenarios);
  if (scenarios.length === 0)
    return <p className="m-0 text-body-sm text-text-muted">{t('scenarios.empty')}</p>;

  // Same matching as the Flows tab: catalog reference, else the catalog app of the same name.
  const entries = flowApps(project, catalog);
  const flowOf = (item: FlowScenario['items'][number]) =>
    entries.find((e) => e.app.id === item.appId)?.entry.flows.find((f) => f.id === item.flowId);
  const target = (b: FlowBinding) => (b.type === 'internet' ? ('internet' as const) : b);
  const calculate = async (scenario: FlowScenario) => {
    const items: LoadItem[] = scenario.items.flatMap((item) => {
      const flow = flowOf(item);
      if (!flow) return [];
      return [
        {
          flow,
          count: item.count,
          bindings: Object.fromEntries(
            Object.entries(item.bindings).map(([k, b]) => [k, target(b)]),
          ),
        },
      ];
    });
    const load = await simulator.load(project, items);
    setResult({ id: scenario.id, load });
    useSimulation.setState({
      load: Object.fromEntries(load.links.map((l) => [l.linkId, l.ratio ?? 0])),
      highlight: null,
    });
  };
  const cable = (id: string) => {
    const link = project.links[id];
    return link ? (link.cable?.label ?? cableLabel(project, link)) : id;
  };

  return (
    <div className="flex flex-col gap-3">
      {scenarios.map((scenario) => {
        const shown = result?.id === scenario.id ? result.load : null;
        const top = shown?.links[0];
        return (
          <section
            key={scenario.id}
            aria-label={scenario.name}
            className="flex flex-col gap-2 rounded-md border border-border-subtle bg-tile p-2.5"
          >
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <TextField
                  label={t('scenarios.name')}
                  defaultValue={scenario.name}
                  onBlur={(e) =>
                    e.target.value.trim() &&
                    e.target.value !== scenario.name &&
                    session.dispatch(renameFlowScenario, { id: scenario.id, name: e.target.value })
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('scenarios.delete', { name: scenario.name })}
                icon={<Trash2 size={14} aria-hidden="true" />}
                onClick={() => session.dispatch(deleteFlowScenario, { id: scenario.id })}
              />
            </div>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {scenario.items.map((item, index) => {
                const flow = flowOf(item);
                const who = Object.values(item.bindings)
                  .map((b) =>
                    b.type === 'internet' ? t('scenarios.internet') : endpointName(project, b),
                  )
                  .join(' → ');
                return (
                  <li
                    key={`${item.appId}:${item.flowId}:${who}`}
                    className="grid grid-cols-[56px_1fr_auto] items-center gap-2"
                  >
                    <TextField
                      label={t('scenarios.count')}
                      hideLabel
                      type="number"
                      min={1}
                      max={100}
                      defaultValue={item.count}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (n !== item.count && Number.isInteger(n) && n >= 1 && n <= 100)
                          session.dispatch(setFlowScenarioItemCount, {
                            id: scenario.id,
                            index,
                            count: n,
                          });
                      }}
                    />
                    <span className="min-w-0 truncate text-body-sm">
                      {`${project.apps[item.appId]?.name ?? '?'} · ${flow?.name.en ?? item.flowId}`}
                      <span className="block truncate font-mono text-data-sm text-text-muted">
                        {who}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('scenarios.remove')}
                      icon={<Trash2 size={14} aria-hidden="true" />}
                      onClick={() =>
                        session.dispatch(removeFlowScenarioItem, { id: scenario.id, index })
                      }
                    />
                  </li>
                );
              })}
            </ul>
            <Button
              variant="primary"
              disabled={scenario.items.length === 0}
              icon={<Gauge size={14} aria-hidden="true" />}
              onClick={() => void calculate(scenario)}
            >
              {t('scenarios.calculate')}
            </Button>
            {shown ? (
              <div className="flex flex-col gap-1.5" aria-live="polite">
                {top?.ratio !== undefined ? (
                  <p className="m-0 flex items-start gap-2 text-body-sm">
                    <Led
                      status={top.ratio > 0.9 ? 'error' : top.ratio > 0.7 ? 'warning' : 'ok'}
                      size={7}
                    />
                    {t('scenarios.bottleneck', {
                      cable: cable(top.linkId),
                      load: formatMbps(top.loadMbps),
                      capacity: formatMbps(top.capacityMbps ?? 0),
                      percent: Math.round(top.ratio * 100),
                    })}
                  </p>
                ) : (
                  <p className="m-0 text-body-sm text-text-secondary">{t('scenarios.noLoad')}</p>
                )}
                {shown.failed > 0 ? (
                  <p className="m-0 text-body-sm text-warning-text">
                    {t('scenarios.failed', { count: shown.failed })}
                  </p>
                ) : null}
                <ul aria-label={t('scenarios.links')} className="m-0 flex list-none flex-col p-0">
                  {shown.links.slice(0, 8).map((l) => (
                    <li
                      key={l.linkId}
                      className="flex gap-2 border-t border-border-subtle py-1 font-mono text-data-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">{cable(l.linkId)}</span>
                      <span className="text-text-secondary">
                        {l.capacityMbps
                          ? `${formatMbps(l.loadMbps)} / ${formatMbps(l.capacityMbps)} · ${Math.round((l.ratio ?? 0) * 100)}%`
                          : formatMbps(l.loadMbps)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
