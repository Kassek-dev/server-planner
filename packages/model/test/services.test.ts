import { describe, expect, it } from 'vitest';
import {
  addDnsRecord,
  addProxyRoute,
  type Command,
  CommandError,
  createId,
  deleteApp,
  execute,
  type ModelContext,
  type Project,
  ProjectSchema,
  updateDnsRecord,
  updateProxyRoute,
} from '../src';
import { buildReverseProxyLab } from './support/reverse-proxy';

/** NET-11 reverse proxy routes and NET-14 local DNS records (schema v2). */

const ctx: ModelContext = { createId, now: () => '2026-11-12T08:00:00.000Z' };
function run<P, R>(project: Project, command: Command<P, R>, payload: P) {
  const out = execute(project, command, payload, ctx);
  expect(ProjectSchema.safeParse(out.project).success).toBe(true);
  return out;
}
function rejected<P>(project: Project, command: Command<P, unknown>, payload: P): string {
  try {
    execute(project, command, payload, ctx);
  } catch (error) {
    expect(error).toBeInstanceOf(CommandError);
    return (error as CommandError).code;
  }
  throw new Error('expected a rejection');
}

const lab = buildReverseProxyLab();
const app = (name: string) => {
  const found = Object.values(lab.apps).find((a) => a.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found.id;
};
const route = Object.values(lab.proxyRoutes)[0];
if (!route) throw new Error('no route');

describe('proxy routes (NET-11)', () => {
  it('stores host names in lower case and keeps them unique', () => {
    const added = run(lab, addProxyRoute, {
      route: {
        hostname: ' Media.Home.Arpa ',
        proxyAppId: app('Caddy'),
        target: { appId: app('Jellyfin'), port: 8096 },
        tls: false,
      },
    });
    expect(added.project.proxyRoutes[added.result]?.hostname).toBe('media.home.arpa');
    expect(
      rejected(lab, addProxyRoute, {
        route: { ...route, hostname: 'JELLYFIN.home.arpa' },
      }),
    ).toBe('PROXY_HOSTNAME_TAKEN');
  });

  it('rejects invalid names, missing apps and a proxy forwarding to itself', () => {
    expect(
      rejected(lab, updateProxyRoute, { id: route.id, changes: { hostname: 'bad name' } }),
    ).toBe('INVALID_HOSTNAME');
    expect(
      rejected(lab, updateProxyRoute, {
        id: route.id,
        changes: { target: { appId: 'app_missing', port: 80 } },
      }),
    ).toBe('NOT_FOUND');
    expect(
      rejected(lab, updateProxyRoute, {
        id: route.id,
        changes: { target: { appId: app('Caddy'), port: 80 } },
      }),
    ).toBe('PROXY_SELF_TARGET');
  });

  it('removes routes with their proxy or target app', () => {
    const without = run(lab, deleteApp, { id: app('Jellyfin') }).project;
    expect(without.proxyRoutes).toEqual({});
  });
});

describe('DNS records (NET-14)', () => {
  const cname = Object.values(lab.dnsRecords).find((r) => r.type === 'CNAME');
  if (!cname) throw new Error('no cname');

  it('allows several A records for a name but a CNAME only alone', () => {
    const second = run(lab, addDnsRecord, {
      record: { type: 'A', name: 'nas.home.arpa', value: '192.168.20.16' },
    });
    expect(Object.values(second.project.dnsRecords)).toHaveLength(4);
    expect(
      rejected(lab, addDnsRecord, {
        record: { type: 'CNAME', name: 'nas.home.arpa', value: 'jellyfin.home.arpa' },
      }),
    ).toBe('DNS_NAME_TAKEN');
    expect(
      rejected(lab, addDnsRecord, {
        record: { type: 'A', name: 'media.home.arpa', value: '192.168.20.16' },
      }),
    ).toBe('DNS_NAME_TAKEN');
  });

  it('validates values and replaces a record on update', () => {
    expect(
      rejected(lab, addDnsRecord, {
        record: { type: 'A', name: 'x.home.arpa', value: '300.1.1.1' },
      }),
    ).toBe('INVALID_IP');
    expect(
      rejected(lab, updateDnsRecord, {
        id: cname.id,
        record: { type: 'CNAME', name: 'media.home.arpa', value: 'media.home.arpa' },
      }),
    ).toBe('DNS_CNAME_SELF');
    const updated = run(lab, updateDnsRecord, {
      id: cname.id,
      record: { type: 'A', name: 'media.home.arpa', value: '192.168.20.15' },
    });
    expect(updated.project.dnsRecords[cname.id]).toMatchObject({
      type: 'A',
      value: '192.168.20.15',
    });
  });

  it('a record keeps living when its DNS app is removed', () => {
    const withServer = run(lab, updateDnsRecord, {
      id: cname.id,
      record: { ...cname, serverAppId: app('Caddy') },
    }).project;
    const without = run(withServer, deleteApp, { id: app('Caddy') }).project;
    expect(without.dnsRecords[cname.id]?.serverAppId).toBeUndefined();
  });
});
