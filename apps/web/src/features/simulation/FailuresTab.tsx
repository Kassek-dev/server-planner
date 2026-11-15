import type { FailureImpact, SinglePointOfFailure } from '@server-planner/engine';
import { cableLabel, type Project } from '@server-planner/model';
import { Play, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices } from '../../app/services';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Led } from '../../ui/Led';
import { Select } from '../../ui/Select';
import { useSimulation } from './store';

interface Scenario {
  devices: string[];
  links: string[];
  powerCut: boolean;
}

const EMPTY: Scenario = { devices: [], links: [], powerCut: false };

/**
 * X-01d Failures (SIM-07): "what if X fails?" — devices, cables or a power cut — and the single
 * points of failure of the lab. The canvas shows what is down and what it cuts off.
 */
export function FailuresTab({ project }: { project: Project }) {
  const { t } = useTranslation('simulation');
  const { simulator } = useServices();
  const [scenario, setScenario] = useState<Scenario>(EMPTY);
  const [impact, setImpact] = useState<FailureImpact | null>(null);
  const [spofs, setSpofs] = useState<SinglePointOfFailure[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => useSimulation.setState({ failure: null }), []);

  const devices = Object.values(project.devices)
    .filter((d) => d.kind !== 'internet')
    .sort((a, b) => a.name.localeCompare(b.name));
  const cables = Object.values(project.links).filter((l) => l.medium !== 'virtual');
  const cableName = (id: string) => {
    const link = project.links[id];
    return link ? (link.cable?.label ?? cableLabel(project, link)) : id;
  };
  const name = (id: string) =>
    project.devices[id]?.name ??
    project.workloads[id]?.name ??
    project.apps[id]?.name ??
    project.assertions[id]?.name ??
    id;

  const run = async (next: Scenario) => {
    setScenario(next);
    setBusy(true);
    try {
      const result = await simulator.failure(project, next);
      setImpact(result);
      useSimulation.setState({
        failure: {
          devices: result.failedDevices,
          links: result.failedLinks,
          affected: [...result.internetLost, ...result.apps.flatMap((a) => a.lostClients)],
        },
      });
    } finally {
      setBusy(false);
    }
  };
  const findSpofs = async () => {
    setBusy(true);
    try {
      setSpofs(await simulator.spof(project));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  const empty = scenario.devices.length + scenario.links.length === 0 && !scenario.powerCut;

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-body-sm text-text-secondary">{t('failures.hint')}</p>
      <fieldset className="m-0 flex max-h-44 flex-col gap-1 overflow-auto border-0 p-0">
        <legend className="mb-1.5 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
          {t('failures.devices')}
        </legend>
        {devices.map((d) => (
          <Checkbox
            key={d.id}
            label={d.name}
            checked={scenario.devices.includes(d.id)}
            onChange={() => setScenario({ ...scenario, devices: toggle(scenario.devices, d.id) })}
          />
        ))}
      </fieldset>
      {cables.length > 0 ? (
        <Select
          label={t('failures.cable')}
          value=""
          options={[
            { value: '', label: t('failures.addCable') },
            ...cables
              .filter((l) => !scenario.links.includes(l.id))
              .map((l) => ({ value: l.id, label: cableName(l.id) })),
          ]}
          onChange={(e) =>
            e.target.value &&
            setScenario({ ...scenario, links: [...scenario.links, e.target.value] })
          }
        />
      ) : null}
      {scenario.links.map((id) => (
        <Checkbox
          key={id}
          label={t('failures.cableDown', { cable: cableName(id) })}
          checked
          onChange={() => setScenario({ ...scenario, links: toggle(scenario.links, id) })}
        />
      ))}
      <Checkbox
        label={t('failures.powerCut')}
        checked={scenario.powerCut}
        onChange={(e) => setScenario({ ...scenario, powerCut: e.target.checked })}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={empty || busy}
          icon={<Play size={14} aria-hidden="true" />}
          onClick={() => void run(scenario)}
        >
          {t('failures.run')}
        </Button>
        <Button
          disabled={busy}
          icon={<Search size={14} aria-hidden="true" />}
          onClick={() => void findSpofs()}
        >
          {t('failures.findSpof')}
        </Button>
      </div>

      {impact ? <ImpactView impact={impact} name={name} /> : null}

      {spofs ? (
        <section aria-label={t('failures.spofTitle')} className="flex flex-col gap-1.5">
          <h3 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
            {t('failures.spofTitle')}
          </h3>
          {spofs.length === 0 ? (
            <p className="m-0 text-body-sm text-text-secondary">{t('failures.noSpof')}</p>
          ) : (
            spofs.map((s) => (
              <button
                key={`${s.ref.type}:${s.ref.id}`}
                type="button"
                onClick={() =>
                  void run(
                    s.ref.type === 'device'
                      ? { devices: [s.ref.id], links: [], powerCut: false }
                      : { devices: [], links: [s.ref.id], powerCut: false },
                  )
                }
                className="flex min-h-9 items-center gap-2 rounded-md border border-border-subtle bg-tile px-2.5 py-1.5 text-left hover:border-border-strong"
              >
                <Led status="warning" size={7} />
                <span className="min-w-0 flex-1 truncate">
                  {s.ref.type === 'device' ? name(s.ref.id) : cableName(s.ref.id)}
                </span>
                <span className="font-mono text-data-sm text-text-secondary">
                  {t('failures.spofSummary', {
                    internet: s.impact.internetLost.length,
                    clients: s.impact.apps.reduce((n, a) => n + a.lostClients.length, 0),
                  })}
                </span>
              </button>
            ))
          )}
        </section>
      ) : null}
    </div>
  );
}

function ImpactView({ impact, name }: { impact: FailureImpact; name: (id: string) => string }) {
  const { t } = useTranslation('simulation');
  const nothing =
    impact.internetLost.length === 0 && impact.apps.length === 0 && impact.assertions.length === 0;
  return (
    <section aria-label={t('failures.impact')} className="flex flex-col gap-2" aria-live="polite">
      <h3 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
        {t('failures.impact')}
      </h3>
      <p className="m-0 text-body-sm">
        {t('failures.down', {
          devices: impact.failedDevices.length,
          links: impact.failedLinks.length,
        })}
      </p>
      {nothing ? (
        <p className="m-0 flex items-center gap-2 text-body-sm">
          <Led status="ok" size={7} />
          {t('failures.noImpact')}
        </p>
      ) : null}
      {impact.internetLost.length > 0 ? (
        <p className="m-0 flex items-start gap-2 text-body-sm">
          <Led status="error" size={7} />
          <span>
            {t('failures.internetLost', {
              count: impact.internetLost.length,
              names: impact.internetLost.map(name).join(', '),
            })}
          </span>
        </p>
      ) : null}
      {impact.apps.map((a) => (
        <p key={a.appId} className="m-0 flex items-start gap-2 text-body-sm">
          <Led status={a.down ? 'error' : 'warning'} size={7} />
          <span>
            {a.down
              ? t('failures.appDown', { app: name(a.appId) })
              : t('failures.appCutOff', {
                  app: name(a.appId),
                  count: a.lostClients.length,
                  names: a.lostClients.map(name).join(', '),
                })}
          </span>
        </p>
      ))}
      {impact.assertions.map((a) => (
        <p key={a.assertionId} className="m-0 flex items-start gap-2 text-body-sm">
          <Led status={a.after === false ? 'error' : 'info'} size={7} />
          <span>
            {t('failures.assertion', { name: name(a.assertionId), result: String(a.after) })}
          </span>
        </p>
      ))}
    </section>
  );
}
