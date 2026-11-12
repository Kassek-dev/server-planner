import type { EntityRef, ReachabilityResult, ServiceVisibility } from '@server-planner/engine';
import type { Project, Protocol } from '@server-planner/model';
import { ChevronLeft } from 'lucide-react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useServices, useSession } from '../../app/services';
import { useResults } from '../../store/results';
import { Button } from '../../ui/Button';
import { Led } from '../../ui/Led';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { Tabs } from '../../ui/Tabs';
import { TextField } from '../../ui/TextField';
import { useSelection } from '../canvas/selection';
import { endpointName, endpointOptions, refFor, type Target, targetFor } from './entities';
import { FixDialog } from './FixDialog';
import { reason, StepList, stepSentence, verdictLed } from './Steps';
import { coverageByDevice, useSimulation } from './store';

type Mode = 'reach' | 'access';
const PROTOCOLS: Protocol[] = ['tcp', 'udp', 'icmp', 'any'];

/** Query params of the simulation panel (docs/07 § 0). */
function useSimParams() {
  const [params, setParams] = useSearchParams();
  const update = (changes: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === undefined || v === '') p.delete(k);
          else p.set(k, v);
        }
        return p;
      },
      { replace: true },
    );
  return { params, update };
}

function useKindLabel() {
  const { t } = useTranslation(['simulation', 'canvas']);
  return (kind: string) =>
    ['vm', 'lxc', 'container', 'app'].includes(kind)
      ? t(`simulation:kinds.${kind}`)
      : t(`canvas:deviceKind.${kind}`);
}

/** X-01 Simulation panel (docs/05 § 7), shown in place of the inspector. */
export function SimulationPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('simulation');
  const project = useSession((s) => s.project);
  const { params, update } = useSimParams();
  const mode: Mode = params.get('sim') === 'access' ? 'access' : 'reach';

  // Overlays and highlights belong to the open panel.
  useEffect(() => () => useSimulation.getState().reset(), []);

  // Esc restores the normal view (docs/05 § 7).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Text fields and dialogs keep Esc; the simulation form's own fields close the panel too.
      if (event.key !== 'Escape' || target?.closest('[role="dialog"]')) return;
      if (target?.closest('input, textarea') && !target.closest('aside')) return;
      onClose();
    };
    // Capture phase: canvas handlers stop Escape before it bubbles to the window.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  if (!project) return null;
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={t('back')}
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-md border border-border-default text-text-primary hover:bg-tile-header"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <h2 className="m-0 text-title font-semibold">{t('title')}</h2>
      </div>
      <Tabs
        label={t('modes.label')}
        value={mode}
        onChange={(next) => update({ sim: next === 'reach' ? undefined : next })}
        tabs={[
          { value: 'reach', label: t('modes.reach') },
          { value: 'access', label: t('modes.access') },
        ]}
      >
        {mode === 'reach' ? <ReachTab project={project} /> : <AccessTab project={project} />}
      </Tabs>
    </>
  );
}

function ReachTab({ project }: { project: Project }) {
  const { t } = useTranslation('simulation');
  const { simulator } = useServices();
  const kindLabel = useKindLabel();
  const { params, update } = useSimParams();
  const portList = useId();

  const from = refFor(project, params.get('from'));
  const to = targetFor(project, params.get('to'));
  const protocol = (PROTOCOLS as string[]).includes(params.get('proto') ?? '')
    ? (params.get('proto') as Protocol)
    : 'tcp';
  const portParam = Number(params.get('port'));
  const port =
    Number.isInteger(portParam) && portParam > 0 && portParam <= 65535 ? portParam : undefined;

  const [form, setForm] = useState({
    from: from?.id ?? '',
    to: to === 'internet' ? 'internet' : (to?.id ?? ''),
    protocol: protocol as string,
    port: port === undefined ? '' : String(port),
  });
  const [result, setResult] = useState<ReachabilityResult | null>(null);
  const [fixOpen, setFixOpen] = useState(false);
  useEffect(() => () => useSimulation.setState({ highlight: null }), []);

  // The URL is the query: re-run whenever it or the project changes (e.g. after applying a fix).
  const key = `${from?.id}|${to === 'internet' ? 'internet' : to?.id}|${protocol}|${port ?? ''}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` captures from/to/protocol/port
  useEffect(() => {
    if (!from || !to) {
      setResult(null);
      useSimulation.setState({ highlight: null });
      return;
    }
    let cancelled = false;
    void simulator
      .reach(project, { from, to, protocol, ...(port !== undefined ? { port } : {}) })
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        useSimulation.setState({ highlight: r });
      });
    return () => {
      cancelled = true;
    };
  }, [key, project, simulator]);

  const options = endpointOptions(project, kindLabel);
  const target = targetFor(project, form.to);
  const listeners =
    target && target !== 'internet' && target.type === 'app'
      ? (project.apps[target.id]?.listeners ?? [])
      : [];

  const run = (event: FormEvent) => {
    event.preventDefault();
    update({ from: form.from, to: form.to, proto: form.protocol, port: form.port });
  };
  const takeSelection = () => {
    const { nodeIds, detail } = useSelection.getState();
    const id = detail?.id ?? nodeIds[0];
    if (id && refFor(project, id)) setForm((f) => ({ ...f, from: id }));
  };
  const portless = form.protocol === 'icmp' || form.protocol === 'any';

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-col gap-3" onSubmit={run}>
        <Select
          label={t('reach.from')}
          value={form.from}
          onChange={(e) => setForm({ ...form, from: e.target.value })}
          options={[{ value: '', label: t('reach.choose') }, ...options]}
        />
        <Button size="sm" variant="ghost" className="self-start px-0" onClick={takeSelection}>
          {t('reach.useSelection')}
        </Button>
        <Select
          label={t('reach.to')}
          value={form.to}
          onChange={(e) => {
            const next = targetFor(project, e.target.value);
            const first =
              next && next !== 'internet' && next.type === 'app'
                ? project.apps[next.id]?.listeners[0]
                : undefined;
            setForm({
              ...form,
              to: e.target.value,
              ...(first ? { protocol: first.protocol, port: String(first.port) } : {}),
            });
          }}
          options={[
            { value: '', label: t('reach.choose') },
            { value: 'internet', label: t('reach.internet') },
            ...options,
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label={t('reach.protocol')}
            mono
            value={form.protocol}
            onChange={(e) => setForm({ ...form, protocol: e.target.value })}
            options={PROTOCOLS.map((p) => ({ value: p, label: p.toUpperCase() }))}
          />
          <TextField
            label={t('reach.port')}
            mono
            inputMode="numeric"
            list={portList}
            disabled={portless}
            value={portless ? '' : form.port}
            onChange={(e) => setForm({ ...form, port: e.target.value.replace(/\D/g, '') })}
          />
          <datalist id={portList}>
            {listeners.map((l) => (
              <option key={`${l.protocol}/${l.port}`} value={l.port}>
                {`${l.protocol}/${l.port}${l.purpose ? ` · ${l.purpose}` : ''}`}
              </option>
            ))}
          </datalist>
        </div>
        <Button type="submit" variant="primary" disabled={!form.from || !form.to}>
          {t('reach.run')}
        </Button>
      </form>

      {result && from && to ? (
        <section className="flex flex-col gap-2" aria-live="polite">
          <ResultSummary
            project={project}
            result={result}
            from={from}
            to={to}
            protocol={protocol}
            {...(port !== undefined ? { port } : {})}
          />
          <h3 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
            {result.blockedAt === undefined
              ? t('reach.path')
              : t('reach.pathBlocked', { step: result.blockedAt + 1 })}
          </h3>
          <StepList project={project} result={result} />
          {result.fix ? (
            <>
              <Button size="sm" className="self-start" onClick={() => setFixOpen(true)}>
                {t('reach.suggestFix')}
              </Button>
              <FixDialog
                project={project}
                fix={result.fix}
                open={fixOpen}
                onOpenChange={setFixOpen}
              />
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** Verdict block in the panel; the same sentence is shown on the canvas card (O-08). */
export function ResultSummary({
  project,
  result,
  from,
  to,
  protocol,
  port,
}: {
  project: Project;
  result: ReachabilityResult;
  from: EntityRef;
  to: Target;
  protocol: Protocol;
  port?: number;
}) {
  const { t } = useTranslation('simulation');
  const status = verdictLed[result.verdict];
  const header =
    result.verdict === 'reachable'
      ? 'bg-ok/15 text-ok-text'
      : result.verdict === 'blocked'
        ? 'bg-error-bg text-error-text'
        : 'bg-warning-bg text-warning-text';
  return (
    <div className="overflow-hidden rounded-md border border-border-default bg-raised">
      <div
        className={`flex items-center gap-2 px-3 py-2 font-mono text-label font-semibold tracking-[0.06em] ${header}`}
      >
        <Led status={status} />
        {t(`verdict.${result.verdict}`)}
      </div>
      <div className="flex flex-col gap-1 px-3 py-2">
        <span className="font-medium">
          {t('reach.query', {
            from: endpointName(project, from),
            to: endpointName(project, to),
            service: port === undefined ? protocol : `${protocol}/${port}`,
          })}
        </span>
        <span className="text-body-sm text-text-secondary">{reason(t, result)}</span>
      </div>
    </div>
  );
}

function AccessTab({ project }: { project: Project }) {
  const { t } = useTranslation('simulation');
  const { simulator } = useServices();
  const kindLabel = useKindLabel();
  const { params, update } = useSimParams();
  const internetOverlay = useSimulation((s) => s.internetOverlay);
  const visibleOn = params.get('visible') !== '0';
  const internet = useResults((s) => s.result?.internet);
  const viewpoint = refFor(project, params.get('view'));
  const [services, setServices] = useState<ServiceVisibility[] | null>(null);
  useEffect(() => () => useSimulation.setState({ visible: null }), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: viewpoint is keyed by its id
  useEffect(() => {
    if (!viewpoint) {
      setServices(null);
      useSimulation.setState({ visible: null });
      return;
    }
    let cancelled = false;
    void simulator.visibleFrom(project, viewpoint).then((list) => {
      if (cancelled) return;
      setServices(list);
      useSimulation.setState({
        visible: visibleOn
          ? { viewpoint, services: list, byDevice: coverageByDevice(project, list) }
          : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [project, simulator, viewpoint?.id, visibleOn]);

  const reachable = services?.filter((s) => s.result.verdict === 'reachable').length ?? 0;
  const viewpointInternet = viewpoint ? internet?.[viewpoint.id] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
          {t('access.overlay')}
        </h3>
        <div className="flex items-center gap-3">
          <span className="flex-1">{t('access.internet')}</span>
          <Segmented
            label={t('access.internet')}
            fill
            value={internetOverlay ? 'on' : 'off'}
            onChange={(v) => useSimulation.setState({ internetOverlay: v === 'on' })}
            options={[
              { value: 'off', label: t('access.off') },
              { value: 'on', label: t('access.on') },
            ]}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="flex-1">{t('access.visible')}</span>
          <Segmented
            label={t('access.visible')}
            fill
            value={visibleOn ? 'on' : 'off'}
            onChange={(v) => update({ visible: v === 'on' ? undefined : '0' })}
            options={[
              { value: 'off', label: t('access.off') },
              { value: 'on', label: t('access.on') },
            ]}
          />
        </div>
      </section>
      <Select
        label={t('access.viewpoint')}
        value={viewpoint?.id ?? ''}
        onChange={(e) => update({ view: e.target.value })}
        options={[{ value: '', label: t('reach.choose') }, ...endpointOptions(project, kindLabel)]}
      />
      {viewpoint && services ? (
        <section className="flex flex-col" aria-live="polite">
          <h3 className="m-0 mb-1 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
            {t('access.summary', {
              name: endpointName(project, viewpoint),
              reachable,
              total: services.length,
            })}
          </h3>
          {viewpointInternet ? (
            <ServiceRow
              status={
                viewpointInternet === 'full'
                  ? 'ok'
                  : viewpointInternet === 'partial'
                    ? 'warning'
                    : 'error'
              }
              name={t('reach.internet')}
              why={t(`access.internetState.${viewpointInternet}`)}
              port="any"
            />
          ) : null}
          {services.map((s) => (
            <ServiceRow
              key={`${s.appId}:${s.protocol}/${s.port}`}
              status={verdictLed[s.result.verdict]}
              name={project.apps[s.appId]?.name ?? '?'}
              why={(() => {
                const step =
                  s.result.blockedAt === undefined
                    ? s.result.steps.find((x) => x.layer === 'firewall')
                    : s.result.steps[s.result.blockedAt];
                return step ? stepSentence(t, step) : t('access.direct');
              })()}
              port={`${s.protocol}/${s.port}`}
            />
          ))}
          {services.length === 0 ? (
            <p className="m-0 text-text-secondary">{t('access.noServices')}</p>
          ) : null}
        </section>
      ) : (
        <p className="m-0 text-text-secondary">{t('access.pickViewpoint')}</p>
      )}
    </div>
  );
}

function ServiceRow({
  status,
  name,
  why,
  port,
}: {
  status: 'ok' | 'warning' | 'error' | 'info' | 'off';
  name: string;
  why: string;
  port: string;
}) {
  return (
    <div className="grid grid-cols-[10px_1fr_auto] items-start gap-2 border-b border-border-subtle py-1.5">
      <span className="mt-1.5">
        <Led status={status} size={7} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span>{name}</span>
        <span className="text-body-sm text-text-secondary">{why}</span>
      </span>
      <span className="font-mono text-data text-text-secondary">{port}</span>
    </div>
  );
}
