import { IpAddressSchema } from '../schema/common';
import { type DnsRecord, HostnameSchema, type ProxyRoute } from '../schema/network';
import type { Project } from '../schema/project';
import { CommandError, type DistributiveOmit, defineCommand, getOrThrow } from './core';

/** Reverse proxy routes (NET-11) and local DNS records (NET-14) — docs/02 § 6.4. */

const normalize = (name: string) => name.trim().toLowerCase();

/** Commands must not let invalid names into the project — they would fail on the next import. */
function checkName(name: string) {
  if (!HostnameSchema.safeParse(name).success) throw new CommandError('INVALID_HOSTNAME', { name });
}

function checkHostnameFree(draft: Project, hostname: string, selfId?: string) {
  const taken = Object.values(draft.proxyRoutes).some(
    (r) => r.id !== selfId && r.hostname === hostname,
  );
  if (taken) throw new CommandError('PROXY_HOSTNAME_TAKEN', { hostname });
}

function checkRoute(draft: Project, route: Omit<ProxyRoute, 'id'>, selfId?: string) {
  checkName(route.hostname);
  getOrThrow(draft.apps, route.proxyAppId, 'app');
  getOrThrow(draft.apps, route.target.appId, 'app');
  if (route.proxyAppId === route.target.appId)
    throw new CommandError('PROXY_SELF_TARGET', { hostname: route.hostname });
  checkHostnameFree(draft, route.hostname, selfId);
}

export const addProxyRoute = defineCommand(
  'proxyRoute.add',
  (draft, { route }: { route: Omit<ProxyRoute, 'id'> }, ctx): string => {
    const next = { ...route, hostname: normalize(route.hostname) };
    checkRoute(draft, next);
    const id = ctx.createId('proxyRoute');
    draft.proxyRoutes[id] = { ...next, id };
    return id;
  },
);

export const updateProxyRoute = defineCommand(
  'proxyRoute.update',
  (draft, { id, changes }: { id: string; changes: Partial<Omit<ProxyRoute, 'id'>> }) => {
    const route = getOrThrow(draft.proxyRoutes, id, 'proxyRoute');
    const next = { ...route, ...changes, hostname: normalize(changes.hostname ?? route.hostname) };
    checkRoute(draft, next, id);
    draft.proxyRoutes[id] = next;
  },
);

export const deleteProxyRoute = defineCommand(
  'proxyRoute.delete',
  (draft, { id }: { id: string }) => {
    getOrThrow(draft.proxyRoutes, id, 'proxyRoute');
    delete draft.proxyRoutes[id];
  },
);

function checkRecord(draft: Project, record: DistributiveOmit<DnsRecord, 'id'>, selfId?: string) {
  checkName(record.name);
  if (record.type === 'CNAME') checkName(record.value);
  else if (!IpAddressSchema.safeParse(record.value).success)
    throw new CommandError('INVALID_IP', { value: record.value });
  if (record.serverAppId) getOrThrow(draft.apps, record.serverAppId, 'app');
  const clash = Object.values(draft.dnsRecords).find(
    (r) =>
      r.id !== selfId &&
      r.name === record.name &&
      // A name may have several A records, but a CNAME stands alone.
      (r.type === 'CNAME' || record.type === 'CNAME'),
  );
  if (clash) throw new CommandError('DNS_NAME_TAKEN', { name: record.name });
  if (record.type === 'CNAME' && record.value === record.name)
    throw new CommandError('DNS_CNAME_SELF', { name: record.name });
}

const normalizeRecord = (record: DistributiveOmit<DnsRecord, 'id'>) =>
  record.type === 'CNAME'
    ? { ...record, name: normalize(record.name), value: normalize(record.value) }
    : { ...record, name: normalize(record.name) };

export const addDnsRecord = defineCommand(
  'dnsRecord.add',
  (draft, { record }: { record: DistributiveOmit<DnsRecord, 'id'> }, ctx): string => {
    const next = normalizeRecord(record);
    checkRecord(draft, next);
    const id = ctx.createId('dnsRecord');
    draft.dnsRecords[id] = { ...next, id } as DnsRecord;
    return id;
  },
);

/** Replaces a record (type, name, value and server change together). */
export const updateDnsRecord = defineCommand(
  'dnsRecord.update',
  (draft, { id, record }: { id: string; record: DistributiveOmit<DnsRecord, 'id'> }) => {
    getOrThrow(draft.dnsRecords, id, 'dnsRecord');
    const next = normalizeRecord(record);
    checkRecord(draft, next, id);
    draft.dnsRecords[id] = { ...next, id } as DnsRecord;
  },
);

export const deleteDnsRecord = defineCommand(
  'dnsRecord.delete',
  (draft, { id }: { id: string }) => {
    getOrThrow(draft.dnsRecords, id, 'dnsRecord');
    delete draft.dnsRecords[id];
  },
);
