import {
  type AppInstance,
  addDnsRecord,
  addProxyRoute,
  type DnsRecord,
  deleteDnsRecord,
  deleteProxyRoute,
  type Project,
  type ProxyRoute,
  updateDnsRecord,
  updateProxyRoute,
} from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '../../ui/Checkbox';
import { Select } from '../../ui/Select';
import {
  AddButton,
  CommitField,
  intValidator,
  RemoveButton,
  Section,
  useCommand,
} from '../inspector/parts';

/** Default local domain (RFC 8375) when no subnet names one. */
const HOME_DOMAIN = 'home.arpa';

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'app';

function freeName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  const [first, ...rest] = base.split('.');
  let n = 2;
  while (taken.has([`${first}-${n}`, ...rest].join('.'))) n += 1;
  return [`${first}-${n}`, ...rest].join('.');
}

/** S-06 Proxy & DNS: reverse proxy routes (NET-11) and local DNS records (NET-14). */
export function ServicesDrawer({ project }: { project: Project }) {
  const domain =
    Object.values(project.subnets).find((s) => s.dns?.domain)?.dns?.domain ?? HOME_DOMAIN;
  return (
    <>
      <ProxySection project={project} domain={domain} />
      <DnsSection project={project} domain={domain} />
    </>
  );
}

function ProxySection({ project, domain }: { project: Project; domain: string }) {
  const { t } = useTranslation('drawers');
  const run = useCommand();
  const apps = Object.values(project.apps).sort((a, b) => a.name.localeCompare(b.name));
  const proxies = apps.filter((a) => a.role === 'proxy');
  const targets = apps.filter((a) => a.role !== 'proxy' && a.listeners.length > 0);
  // Order of creation: rows must not jump while their name is being edited.
  const routes = Object.values(project.proxyRoutes);
  const appOptions = (list: AppInstance[]) => list.map((a) => ({ value: a.id, label: a.name }));

  const add = () => {
    const proxy = proxies[0];
    const target = targets.find((a) => !routes.some((r) => r.target.appId === a.id)) ?? targets[0];
    const port = target?.listeners[0]?.port;
    if (!proxy || !target || port === undefined) return;
    const taken = new Set(routes.map((r) => r.hostname));
    run(addProxyRoute, {
      route: {
        hostname: freeName(`${slug(target.name)}.${domain}`, taken),
        proxyAppId: proxy.id,
        target: { appId: target.id, port },
        tls: true,
      },
    });
  };
  const update = (route: ProxyRoute, changes: Partial<Omit<ProxyRoute, 'id'>>) =>
    run(updateProxyRoute, { id: route.id, changes });

  return (
    <Section
      title={t('services.proxyTitle', { count: routes.length })}
      action={
        proxies.length > 0 && targets.length > 0 ? (
          <AddButton label={t('services.addRoute')} onClick={add} />
        ) : undefined
      }
    >
      <p className="m-0 text-body-sm text-text-muted">
        {proxies.length === 0 ? t('services.noProxy') : t('services.proxyHint')}
      </p>
      {routes.map((route) => {
        const target = project.apps[route.target.appId];
        const ports = target?.listeners.map((l) => l.port) ?? [];
        return (
          <fieldset
            key={route.id}
            className="m-0 grid grid-cols-[1fr_1fr] items-end gap-2.5 border-0 border-b border-border-subtle p-0 pb-3"
          >
            <legend className="sr-only">{route.hostname}</legend>
            <CommitField
              label={t('services.hostname')}
              mono
              value={route.hostname}
              onCommit={(hostname) => hostname && update(route, { hostname })}
            />
            <Select
              label={t('services.proxy')}
              value={route.proxyAppId}
              options={appOptions(proxies.length > 0 ? proxies : apps)}
              onChange={(e) => update(route, { proxyAppId: e.target.value })}
            />
            <Select
              label={t('services.target')}
              value={route.target.appId}
              options={appOptions(targets)}
              onChange={(e) => {
                const next = project.apps[e.target.value];
                const port = next?.listeners[0]?.port ?? route.target.port;
                update(route, { target: { appId: e.target.value, port } });
              }}
            />
            {ports.length > 0 && ports.includes(route.target.port) ? (
              <Select
                label={t('services.port')}
                mono
                value={String(route.target.port)}
                options={ports.map((p) => ({ value: String(p), label: String(p) }))}
                onChange={(e) =>
                  update(route, { target: { ...route.target, port: Number(e.target.value) } })
                }
              />
            ) : (
              <CommitField
                label={t('services.port')}
                mono
                value={String(route.target.port)}
                validate={intValidator(1, 65535, t('services.portError'))}
                onCommit={(v) => update(route, { target: { ...route.target, port: Number(v) } })}
              />
            )}
            <Checkbox
              label={t('services.tls')}
              checked={route.tls}
              onChange={(e) => update(route, { tls: e.target.checked })}
            />
            <div className="flex justify-end">
              <RemoveButton
                label={t('services.removeRoute', { hostname: route.hostname })}
                onClick={() => run(deleteProxyRoute, { id: route.id })}
              />
            </div>
          </fieldset>
        );
      })}
    </Section>
  );
}

/** First static address in the project — a sensible starting value for a new A record. */
const someAddress = (project: Project) =>
  Object.values(project.interfaces)
    .flatMap((i) => i.addresses)
    .find((a) => a.address)?.address ?? '192.168.1.10';

function DnsSection({ project, domain }: { project: Project; domain: string }) {
  const { t } = useTranslation('drawers');
  const run = useCommand();
  const records = Object.values(project.dnsRecords);
  const servers = Object.values(project.apps).filter((a) => a.role === 'dns');
  const replace = (record: DnsRecord, next: Partial<DnsRecord>) => {
    const { id: _, ...rest } = { ...record, ...next } as DnsRecord;
    if (rest.serverAppId === undefined) delete rest.serverAppId;
    run(updateDnsRecord, { id: record.id, record: rest });
  };
  const add = () =>
    run(addDnsRecord, {
      record: {
        type: 'A',
        name: freeName(`host.${domain}`, new Set(records.map((r) => r.name))),
        value: someAddress(project),
      },
    });

  return (
    <Section
      title={t('services.dnsTitle', { count: records.length })}
      action={<AddButton label={t('services.addRecord')} onClick={add} />}
    >
      <p className="m-0 text-body-sm text-text-muted">{t('services.dnsHint')}</p>
      {records.map((record) => (
        <fieldset
          key={record.id}
          className="m-0 grid grid-cols-[1fr_88px_1fr] items-end gap-2.5 border-0 border-b border-border-subtle p-0 pb-3"
        >
          <legend className="sr-only">{`${record.name} ${record.type}`}</legend>
          <CommitField
            label={t('services.name')}
            mono
            value={record.name}
            onCommit={(name) => name && replace(record, { name })}
          />
          <Select
            label={t('services.type')}
            mono
            value={record.type}
            options={['A', 'CNAME'].map((v) => ({ value: v, label: v }))}
            onChange={(e) => {
              const type = e.target.value as DnsRecord['type'];
              if (type === record.type) return;
              // Switching the type needs a value of the other kind.
              const value =
                type === 'A'
                  ? someAddress(project)
                  : (Object.values(project.proxyRoutes)[0]?.hostname ?? `proxy.${domain}`);
              replace(record, { type, value } as Partial<DnsRecord>);
            }}
          />
          <CommitField
            label={record.type === 'A' ? t('services.address') : t('services.alias')}
            mono
            value={record.value}
            onCommit={(value) => value && replace(record, { value })}
          />
          <Select
            label={t('services.server')}
            value={record.serverAppId ?? ''}
            options={[
              { value: '', label: t('services.anyServer') },
              ...servers.map((a) => ({ value: a.id, label: a.name })),
            ]}
            onChange={(e) =>
              replace(
                record,
                e.target.value ? { serverAppId: e.target.value } : { serverAppId: undefined },
              )
            }
          />
          <span />
          <div className="flex justify-end">
            <RemoveButton
              label={t('services.removeRecord', { name: record.name })}
              onClick={() => run(deleteDnsRecord, { id: record.id })}
            />
          </div>
        </fieldset>
      ))}
    </Section>
  );
}
