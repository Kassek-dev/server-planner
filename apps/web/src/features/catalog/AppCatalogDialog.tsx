import {
  addAppFromCatalog,
  type CatalogApp,
  type HostRef,
  type Project,
} from '@server-planner/model';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSize } from '../../app/format';
import { useCatalog } from '../../catalog/store';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Select } from '../../ui/Select';
import { useSelection } from '../canvas/selection';
import { useTransaction } from '../inspector/parts';
import { AddAppWizard } from './AddAppWizard';
import { appHosts, appPorts, hostKey, installedApps, parseHostKey } from './helpers';

/** D-06 App catalog (docs/07): categories, search, multi-select, details; one app → D-07 wizard. */
export function AppCatalogDialog({
  project,
  host: initialHost,
  open,
  onOpenChange,
}: {
  project: Project;
  host: HostRef | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('catalog');
  const catalog = useCatalog((s) => s.catalog);
  const transaction = useTransaction();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [focused, setFocused] = useState<string | null>(null);
  const [host, setHost] = useState<HostRef | undefined>(initialHost);
  const [wizard, setWizard] = useState<CatalogApp | null>(null);

  useEffect(() => {
    if (open) void useCatalog.getState().load();
  }, [open]);
  useEffect(() => {
    if (open) setHost(initialHost);
  }, [open, initialHost]);

  const apps = catalog?.apps ?? [];
  const installed = installedApps(project);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of apps) for (const c of a.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [apps]);
  const q = query.trim().toLowerCase();
  const results = apps
    .filter(
      (a) =>
        (category === 'all' || a.categories.includes(category)) &&
        (!q ||
          a.name.toLowerCase().includes(q) ||
          a.description.en.toLowerCase().includes(q) ||
          a.categories.some((c) => c.includes(q))),
    )
    // Name matches first, then alphabetical (curated and imported apps mixed).
    .sort(
      (a, b) =>
        Number(!!q && !a.name.toLowerCase().includes(q)) -
          Number(!!q && !b.name.toLowerCase().includes(q)) || a.name.localeCompare(b.name),
    );
  const detail = apps.find((a) => a.id === (focused ?? selected[0])) ?? results[0];
  const hosts = appHosts(project);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const add = () => {
    const chosen = selected
      .map((id) => apps.find((a) => a.id === id))
      .filter((a): a is CatalogApp => !!a);
    const only = chosen[0];
    if (chosen.length === 1 && only) {
      setWizard(only);
      return;
    }
    if (!host || !catalog) return;
    const result = transaction('app.addFromCatalog.many', (run) =>
      chosen.map((app) =>
        run(addAppFromCatalog, { app, catalogVersion: catalog.catalogVersion, host }),
      ),
    );
    if (!result) return;
    setSelected([]);
    onOpenChange(false);
    if (host.type === 'workload')
      useSelection.getState().setDetail({ type: 'workload', id: host.id });
    else useSelection.getState().set([host.id]);
  };

  return (
    <>
      <Dialog
        open={open && !wizard}
        onOpenChange={onOpenChange}
        title={t('apps.title')}
        closeLabel={t('cancel')}
        width={1040}
        flush
        footer={
          <>
            <span className="font-mono text-data text-text-secondary">
              {t('apps.selected', { count: selected.length })}
            </span>
            <div className="w-64">
              <Select
                label={t('apps.target')}
                hideLabel
                value={host ? hostKey(host) : ''}
                onChange={(e) => setHost(parseHostKey(e.target.value))}
                options={[
                  { value: '', label: t('apps.chooseHost') },
                  ...hosts.map((h) => ({
                    value: hostKey(h.ref),
                    label: t('apps.targetOption', { host: h.label }),
                  })),
                ]}
              />
            </div>
            <span className="grow" />
            <Button onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
            <Button
              variant="primary"
              disabled={selected.length === 0 || (selected.length > 1 && !host)}
              onClick={add}
            >
              {selected.length === 1
                ? t('apps.configure')
                : t('apps.add', { count: Math.max(1, selected.length) })}
            </Button>
          </>
        }
      >
        <div className="flex h-[480px] min-h-0">
          <nav
            aria-label={t('apps.categories')}
            className="flex w-50 shrink-0 flex-col gap-0.5 overflow-auto border-r border-border-subtle px-3 py-4"
          >
            {[['all', apps.length] as const, ...categories].map(([id, count]) => (
              <button
                key={id}
                type="button"
                aria-pressed={category === id}
                onClick={() => setCategory(id)}
                className={`flex justify-between rounded-md px-2.5 py-1.5 text-left ${category === id ? 'bg-tile-header text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
              >
                <span className="truncate">{t(`categories.${id}`, { defaultValue: id })}</span>
                <span className="font-mono text-data-sm">{count}</span>
              </button>
            ))}
          </nav>
          <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-auto p-4">
            <input
              type="search"
              aria-label={t('apps.search')}
              placeholder={t('apps.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 shrink-0 rounded-md border border-border-default bg-inset px-2.5 text-body text-text-primary outline-none focus:border-accent"
            />
            <span className="font-mono text-data-sm text-text-muted" role="status">
              {t('apps.results', { count: results.length })}
            </span>
            {results.map((app) => {
              const checked = selected.includes(app.id);
              return (
                <label
                  key={app.id}
                  onMouseEnter={() => setFocused(app.id)}
                  onFocus={() => setFocused(app.id)}
                  className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 ${checked ? 'border-accent bg-accent-subtle' : 'border-border-subtle bg-tile'} ${installed.has(app.id) ? 'opacity-70' : ''}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <b>{app.name}</b>
                      <Confidence value={app.confidence} />
                    </span>
                    <span className="truncate text-body-sm text-text-secondary">
                      {app.description.en}
                    </span>
                    <span className="font-mono text-data-sm text-text-muted">
                      {installed.has(app.id)
                        ? t('apps.inProject')
                        : t('apps.meta', {
                            containers: app.deployment.components.length,
                            cpu: app.requirements.min.cpu,
                            memory: formatSize(app.requirements.min.memoryBytes),
                            ports: appPorts(app) || '—',
                          })}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="size-4 accent-accent"
                    aria-label={t('apps.select', { name: app.name })}
                    checked={checked}
                    onChange={() => toggle(app.id)}
                  />
                </label>
              );
            })}
          </div>
          <aside
            aria-label={t('apps.details')}
            className="w-75 shrink-0 overflow-auto border-l border-border-subtle px-5 py-4"
          >
            {detail ? <AppDetails app={detail} /> : null}
          </aside>
        </div>
      </Dialog>
      {wizard ? (
        <AddAppWizard
          project={project}
          app={wizard}
          host={host ?? initialHost}
          open
          onOpenChange={(next) => {
            if (next) return;
            setWizard(null);
            setSelected([]);
            onOpenChange(false);
          }}
        />
      ) : null}
    </>
  );
}

function Confidence({ value }: { value: CatalogApp['confidence'] }) {
  const { t } = useTranslation('catalog');
  return (
    <span
      className={`rounded-xs border border-border-default px-1 font-mono text-badge font-semibold ${value === 'curated' ? 'text-ok-text' : 'text-text-secondary'}`}
    >
      {t(`confidence.${value}`)}
    </span>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <h4 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
      {children}
    </h4>
  );
}

function AppDetails({ app }: { app: CatalogApp }) {
  const { t } = useTranslation('catalog');
  const r = app.requirements;
  const res = (x: typeof r.min) =>
    t('apps.resources', { cpu: x.cpu, memory: formatSize(x.memoryBytes) });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="m-0 text-title font-semibold">{app.name}</h3>
        <Confidence value={app.confidence} />
      </div>
      <p className="m-0 leading-normal text-text-secondary">{app.description.en}</p>
      <section className="flex flex-col gap-1">
        <Heading>{app.deployment.kind === 'stack' ? t('apps.stack') : t('apps.container')}</Heading>
        {app.deployment.components.map((c) => (
          <div key={c.key} className="flex justify-between gap-2 text-body-sm">
            <span className="truncate">{c.name}</span>
            <span className="font-mono text-data-sm text-text-secondary">
              {c.defaultPortMappings?.length
                ? c.defaultPortMappings.map((m) => `:${m.hostPort}`).join(' ')
                : t('apps.internal')}
            </span>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-1 text-body-sm">
        <Heading>{t('apps.requirements')}</Heading>
        <span className="flex justify-between">
          <span>{t('apps.minimum')}</span>
          <span className="font-mono">{res(r.min)}</span>
        </span>
        <span className="flex justify-between">
          <span>{t('apps.recommended')}</span>
          <span className="font-mono">{res(r.recommended)}</span>
        </span>
        <span className="flex justify-between">
          <span>{t('apps.storage')}</span>
          <span className="font-mono">{formatSize(r.recommended.diskBytes, true)}</span>
        </span>
      </section>
      <section className="flex flex-col gap-1">
        <Heading>{t('apps.traffic')}</Heading>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0 font-mono text-data-sm text-text-secondary">
          {app.trafficPatterns.map((p) => (
            <li key={p.id}>
              {t(`apps.pattern.${p.direction}`, {
                peer: t(`apps.peer.${p.peer.kind}`),
                service: `${p.protocol}/${p.port ?? '*'}`,
                purpose: p.purpose,
              })}
            </li>
          ))}
        </ul>
      </section>
      {app.dependencies.length > 0 ? (
        <section className="flex flex-col gap-1">
          <Heading>{t('apps.dependencies')}</Heading>
          <span className="text-body-sm text-text-secondary">
            {app.dependencies
              .map((d) =>
                d.optional ? t('apps.optional', { capability: d.capability }) : d.capability,
              )
              .join(', ')}
          </span>
        </section>
      ) : null}
      <section className="flex flex-col gap-1">
        <Heading>{t('apps.sources')}</Heading>
        <span className="font-mono text-data-sm text-text-muted">
          {[...app.source, app.license].filter(Boolean).join(' · ')}
        </span>
        {app.website?.startsWith('https://') ? (
          <a
            href={app.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-body-sm text-accent-text hover:underline"
          >
            {t('apps.website')}
          </a>
        ) : null}
      </section>
    </div>
  );
}
