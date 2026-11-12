import {
  type AddAppOptions,
  addAppFromCatalog,
  type CatalogApp,
  type HostRef,
  type PortMapping,
  type Project,
} from '@server-planner/model';
import { Check } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSize, parseSize } from '../../app/format';
import { useCatalog } from '../../catalog/store';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Select } from '../../ui/Select';
import { useSelection } from '../canvas/selection';
import { useTransaction } from '../inspector/parts';
import { appHosts, hostKey, hostPools, nextFreePort, parseHostKey, takenPorts } from './helpers';

type Step = 'where' | 'ports' | 'network';
const STEPS: Step[] = ['where', 'ports', 'network'];

/** D-07 Add app wizard (docs/05 § 6.3): every step has a sensible default, Add works from step 1. */
export function AddAppWizard({
  project,
  app,
  host: initialHost,
  open,
  onOpenChange,
}: {
  project: Project;
  app: CatalogApp;
  host: HostRef | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('catalog');
  const catalogVersion = useCatalog((s) => s.catalog?.catalogVersion) ?? 'unknown';
  const transaction = useTransaction();
  const hosts = appHosts(project);
  const [step, setStep] = useState<Step>('where');
  const [host, setHost] = useState<HostRef | undefined>(initialHost ?? hosts[0]?.ref);
  const [ports, setPorts] = useState<Record<string, PortMapping[]>>(() =>
    Object.fromEntries(
      app.deployment.components.map((c) => [
        c.key,
        (c.defaultPortMappings ?? []).map((m) => ({ ...m })),
      ]),
    ),
  );
  const pools = host ? hostPools(project, host) : [];
  const defaultPool = pools.find((p) => p.purpose?.includes('containers')) ?? pools[0];
  const [volumes, setVolumes] = useState<Record<string, { poolId?: string; size: string }>>(() =>
    Object.fromEntries(
      app.deployment.components.flatMap((c) =>
        c.volumes.map((v) => [
          `${c.key}/${v.name}`,
          { size: v.defaultSizeBytes ? formatSize(v.defaultSizeBytes, true) : '' },
        ]),
      ),
    ),
  );
  const [networkId, setNetworkId] = useState('');

  const networks = host
    ? Object.values(project.dockerNetworks).filter(
        (n) => n.host.type === host.type && n.host.id === host.id,
      )
    : [];
  const hostDevice = host?.type === 'device' ? project.devices[host.id] : undefined;
  const dockerOnProxmox = hostDevice?.os?.osId === 'proxmox-ve';

  // Conflicts: a host port taken on the host, or twice in this app.
  const conflicts = useMemo(() => {
    const out = new Map<string, number>();
    if (!host) return out;
    const taken = takenPorts(project, host);
    const planned = new Set<string>();
    for (const [key, list] of Object.entries(ports)) {
      list.forEach((m, i) => {
        const id = `${m.protocol}/${m.hostPort}`;
        if (taken.has(id) || planned.has(id))
          out.set(
            `${key}#${i}`,
            nextFreePort(new Set([...taken, ...planned]), m.protocol, m.hostPort + 1),
          );
        planned.add(id);
      });
    }
    return out;
  }, [project, host, ports]);

  const setPort = (key: string, index: number, change: Partial<PortMapping> | null) =>
    setPorts((current) => {
      const list = [...(current[key] ?? [])];
      if (change === null) list.splice(index, 1);
      else list[index] = { ...(list[index] as PortMapping), ...change };
      return { ...current, [key]: list };
    });

  const sizeInvalid = Object.values(volumes).some(
    (v) => v.size !== '' && parseSize(v.size) === undefined,
  );

  const add = () => {
    if (!host) return;
    const options: AddAppOptions = {
      ports,
      volumes: Object.fromEntries(
        Object.entries(volumes).map(([key, v]) => {
          // '' = explicitly no pool; unset = the host's default pool.
          const poolId = v.poolId === undefined ? defaultPool?.id : v.poolId || undefined;
          const sizeBytes = parseSize(v.size);
          return [
            key,
            { ...(poolId ? { poolId } : {}), ...(sizeBytes !== undefined ? { sizeBytes } : {}) },
          ];
        }),
      ),
      ...(networkId ? { dockerNetworkId: networkId } : {}),
    };
    const result = transaction(`app.addFromCatalog.${app.id}`, (run) =>
      run(addAppFromCatalog, { app, catalogVersion, host, options }),
    );
    if (!result) return;
    onOpenChange(false);
    const main = result.appIds[0];
    if (main) useSelection.getState().setDetail({ type: 'app', id: main });
  };

  const index = STEPS.indexOf(step);
  const hostLabel = hosts.find((h) => host && hostKey(h.ref) === hostKey(host))?.label ?? '';
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('wizard.title', { name: app.name })}
      closeLabel={t('cancel')}
      width={640}
      footer={
        <>
          <span className="mr-auto truncate font-mono text-data text-text-secondary">
            {t('wizard.summary', { name: app.name, host: hostLabel })}
          </span>
          {index > 0 ? (
            <Button onClick={() => setStep(STEPS[index - 1] as Step)}>{t('wizard.back')}</Button>
          ) : null}
          {index < STEPS.length - 1 ? (
            <Button onClick={() => setStep(STEPS[index + 1] as Step)}>
              {t(`wizard.next.${STEPS[index + 1]}`)}
            </Button>
          ) : null}
          <Button variant="primary" disabled={!host || sizeInvalid} onClick={add}>
            {t('wizard.add', { name: app.name })}
          </Button>
        </>
      }
    >
      <ol className="m-0 flex list-none items-center gap-3 p-0">
        {STEPS.map((s, i) => (
          <Fragment key={s}>
            {i > 0 ? <li aria-hidden="true" className="h-px flex-1 bg-border-default" /> : null}
            <li className="flex items-center gap-2" aria-current={s === step ? 'step' : undefined}>
              <span
                className={`flex size-5.5 items-center justify-center rounded-pill font-mono text-data-sm font-semibold ${
                  i < index
                    ? 'bg-ok/15 text-ok-text'
                    : s === step
                      ? 'bg-accent text-on-accent'
                      : 'bg-tile-header text-text-secondary'
                }`}
              >
                {i < index ? <Check size={12} aria-hidden="true" /> : i + 1}
              </span>
              <button
                type="button"
                onClick={() => setStep(s)}
                className={
                  s === step ? 'font-semibold' : 'text-text-secondary hover:text-text-primary'
                }
              >
                {t(`wizard.steps.${s}`)}
              </button>
            </li>
          </Fragment>
        ))}
      </ol>

      {step === 'where' ? (
        <>
          <Select
            label={t('wizard.host')}
            value={host ? hostKey(host) : ''}
            onChange={(e) => setHost(parseHostKey(e.target.value))}
            options={hosts.map((h) => ({ value: hostKey(h.ref), label: h.label }))}
          />
          {hosts.length === 0 ? <Banner kind="warning">{t('wizard.noHosts')}</Banner> : null}
          {dockerOnProxmox ? <Banner kind="warning">{t('wizard.proxmoxDocker')}</Banner> : null}
          <p className="m-0 text-text-secondary">
            {t('wizard.containers', { count: app.deployment.components.length })}
          </p>
        </>
      ) : null}

      {step === 'ports' ? (
        <>
          <section className="flex flex-col gap-2">
            <h3 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
              {t('wizard.ports')}
            </h3>
            {Object.values(ports).every((l) => l.length === 0) ? (
              <p className="m-0 text-text-secondary">{t('wizard.noPorts')}</p>
            ) : null}
            {app.deployment.components.map((c) =>
              (ports[c.key] ?? []).map((m, i) => {
                const suggestion = conflicts.get(`${c.key}#${i}`);
                const purpose = c.listeners.find(
                  (l) => l.port === m.containerPort && l.protocol === m.protocol,
                )?.purpose;
                return (
                  <div
                    key={`${c.key}:${m.containerPort}/${m.protocol}`}
                    className="flex flex-col gap-1"
                  >
                    <div className="grid grid-cols-[96px_16px_80px_48px_1fr_auto] items-center gap-2">
                      <input
                        aria-label={t('wizard.hostPort', {
                          container: c.name,
                          port: m.containerPort,
                        })}
                        inputMode="numeric"
                        value={m.hostPort}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/\D/g, ''));
                          if (n >= 1 && n <= 65535) setPort(c.key, i, { hostPort: n });
                        }}
                        className={`h-8 rounded-md border bg-inset px-2 font-mono text-data text-text-primary outline-none focus:border-accent ${suggestion ? 'border-error' : 'border-border-default'}`}
                      />
                      <span aria-hidden="true" className="text-text-muted">
                        →
                      </span>
                      <span className="font-mono text-data">{`:${m.containerPort}`}</span>
                      <span className="font-mono text-data-sm text-text-secondary">
                        {m.protocol}
                      </span>
                      <span className="truncate text-body-sm text-text-secondary">
                        {`${c.name}${purpose ? ` · ${purpose}` : ''}`}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setPort(c.key, i, null)}>
                        {t('wizard.unpublish')}
                      </Button>
                    </div>
                    {suggestion ? (
                      <span className="flex items-center gap-2 text-body-sm text-error-text">
                        {t('wizard.portTaken', { port: m.hostPort })}
                        <Button
                          size="sm"
                          onClick={() => setPort(c.key, i, { hostPort: suggestion })}
                        >
                          {t('wizard.usePort', { port: suggestion })}
                        </Button>
                      </span>
                    ) : null}
                  </div>
                );
              }),
            )}
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
              {t('wizard.volumes')}
            </h3>
            {app.deployment.components.flatMap((c) =>
              c.volumes.map((v) => {
                const key = `${c.key}/${v.name}`;
                const value = volumes[key] ?? { size: '' };
                const invalid = value.size !== '' && parseSize(value.size) === undefined;
                return (
                  <div key={key} className="grid grid-cols-[1fr_140px_96px] items-end gap-2">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate">{`${c.name} · ${v.name}`}</span>
                      <span className="truncate font-mono text-data-sm text-text-muted">
                        {v.containerPath}
                      </span>
                    </span>
                    <Select
                      label={t('wizard.pool', { volume: v.name })}
                      hideLabel
                      value={value.poolId ?? defaultPool?.id ?? ''}
                      onChange={(e) =>
                        setVolumes((cur) => ({
                          ...cur,
                          [key]: { ...value, poolId: e.target.value },
                        }))
                      }
                      options={[
                        { value: '', label: t('wizard.noPool') },
                        ...pools.map((p) => ({ value: p.id, label: p.name })),
                      ]}
                    />
                    <input
                      aria-label={t('wizard.size', { volume: v.name })}
                      aria-invalid={invalid || undefined}
                      value={value.size}
                      placeholder="—"
                      onChange={(e) =>
                        setVolumes((cur) => ({ ...cur, [key]: { ...value, size: e.target.value } }))
                      }
                      className={`h-8 rounded-md border bg-inset px-2 font-mono text-data text-text-primary outline-none focus:border-accent ${invalid ? 'border-error' : 'border-border-default'}`}
                    />
                  </div>
                );
              }),
            )}
          </section>
        </>
      ) : null}

      {step === 'network' ? (
        <>
          <Select
            label={t('wizard.network')}
            value={networkId}
            onChange={(e) => setNetworkId(e.target.value)}
            options={[
              {
                value: '',
                label: networks.find((n) => n.driver === 'bridge')
                  ? t('wizard.firstBridge')
                  : t('wizard.createBridge'),
              },
              ...networks.map((n) => ({ value: n.id, label: `${n.name} · ${n.driver}` })),
            ]}
          />
          <p className="m-0 text-text-secondary">{t('wizard.networkHint')}</p>
        </>
      ) : null}
    </Dialog>
  );
}
