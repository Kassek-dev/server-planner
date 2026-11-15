import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addDnsRecord,
  type Project,
  parseProjectFile,
  updateDnsRecord,
  updateProxyRoute,
} from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { buildContext, exposureWithRoutes, proxyRoutes, resolveLocalName } from '../src';
import { analyze, apply } from './support';

/** NET-11 reverse proxy routes and NET-14 local DNS records (fixture v2/reverse-proxy). */

const raw = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../fixtures/schema/v2/reverse-proxy.json'), 'utf8'),
);
const lab = (): Project => parseProjectFile(raw).file.project;
const codes = (p: Project) => analyze(p).issues.map((i) => i.code);
const route = (p: Project) => {
  const r = Object.values(p.proxyRoutes)[0];
  if (!r) throw new Error('no route');
  return r;
};

describe('reverse proxy (NET-11)', () => {
  it('the proxy reaches the app behind its route', () => {
    const [result] = proxyRoutes(buildContext(lab()));
    expect(result?.hostname).toBe('jellyfin.home.arpa');
    expect(result?.result.verdict).toBe('reachable');
    expect(codes(lab())).not.toContain('VAL_PROXY');
  });

  it('a port forward to the proxy exposes its host names (SIM-05)', () => {
    const forwards = exposureWithRoutes(buildContext(lab()));
    const https = forwards.find((e) => e.externalPort === 443);
    expect(https?.result.verdict).toBe('reachable');
    expect(https?.routes?.map((r) => r.hostname)).toEqual(['jellyfin.home.arpa']);
  });

  it('flags a route to a port the app does not listen on', () => {
    const p = lab();
    const r = route(p);
    const broken = apply(p, updateProxyRoute, {
      id: r.id,
      changes: { target: { ...r.target, port: 9999 } },
    });
    const found = analyze(broken).issues.find((i) => i.code === 'VAL_PROXY');
    expect(found?.params).toMatchObject({ hostname: 'jellyfin.home.arpa', port: 9999 });
  });
});

describe('local DNS (NET-14)', () => {
  it('resolves CNAME chains to addresses', () => {
    const ctx = buildContext(lab());
    expect(resolveLocalName(ctx, 'media.home.arpa')).toEqual(['192.168.20.15']);
    expect(resolveLocalName(ctx, 'unknown.home.arpa')).toBeUndefined();
  });

  it('warns about records for unknown addresses and names not pointing to the proxy', () => {
    const p = lab();
    const a = Object.values(p.dnsRecords).find((r) => r.name === 'jellyfin.home.arpa');
    if (!a) throw new Error('no record');
    const moved = apply(p, updateDnsRecord, {
      id: a.id,
      record: { type: 'A', name: a.name, value: '192.168.20.99' },
    });
    expect(codes(moved)).toEqual(expect.arrayContaining(['VAL_DNS_ADDRESS', 'VAL_PROXY_DNS']));
    expect(codes(p)).not.toContain('VAL_PROXY_DNS');
    expect(codes(p)).not.toContain('VAL_DNS_ADDRESS');
    const extra = apply(p, addDnsRecord, {
      record: { type: 'A', name: 'printer.home.arpa', value: '192.168.20.2' },
    });
    expect(codes(extra)).not.toContain('VAL_DNS_ADDRESS');
  });
});
