import type { EngineContext } from '../context';
import type { EntityRef } from '../types';
import { addressesOf, type Exposure, exposure, type ProxyRouteResult, reach } from './reach';

/** Reverse proxy routes (NET-11) and local DNS names (NET-14) — docs/02 § 6.4. */

/** Every proxy route with the proxy → app connection (the leg the proxy opens itself). */
export function proxyRoutes(ctx: EngineContext): ProxyRouteResult[] {
  return Object.values(ctx.project.proxyRoutes).map((route) => ({
    routeId: route.id,
    hostname: route.hostname,
    proxyAppId: route.proxyAppId,
    appId: route.target.appId,
    port: route.target.port,
    result: reach(ctx, {
      from: { type: 'app', id: route.proxyAppId },
      to: { type: 'app', id: route.target.appId },
      protocol: 'tcp',
      port: route.target.port,
    }),
  }));
}

const sameRef = (a: EntityRef, b: { type: string; id: string }) =>
  a.type === b.type && a.id === b.id;

/**
 * SIM-05 with reverse proxies: a port forward that reaches a proxy app (or the host it runs on, on
 * one of its listener ports) also exposes the host names that proxy serves.
 */
export function exposureWithRoutes(ctx: EngineContext): Exposure[] {
  const routes = proxyRoutes(ctx);
  const p = ctx.project;
  return exposure(ctx).map((e) => {
    if (e.result.verdict !== 'reachable' || !e.target) return e;
    const rule = p.devices[e.routerId]?.firewall?.nat.find((r) => r.id === e.ruleId);
    const port = rule?.kind === 'port-forward' ? rule.target.port : undefined;
    const target = e.target;
    const proxies = Object.values(p.apps).filter(
      (app) =>
        (target.type === 'app' ? target.id === app.id : sameRef(target, app.runsOn)) &&
        app.listeners.some((l) => l.port === port && l.protocol === 'tcp'),
    );
    const served = routes.filter((r) => proxies.some((app) => app.id === r.proxyAppId));
    return served.length > 0 ? { ...e, routes: served } : e;
  });
}

/** A name resolved through local records (CNAME chains, at most 8 hops): its A addresses. */
export function resolveLocalName(ctx: EngineContext, name: string): string[] | undefined {
  const records = Object.values(ctx.project.dnsRecords);
  let current = name;
  for (let hop = 0; hop < 8; hop += 1) {
    const found = records.filter((r) => r.name === current);
    if (found.length === 0) return hop === 0 ? undefined : [];
    const cname = found.find((r) => r.type === 'CNAME');
    if (!cname) return found.map((r) => r.value);
    current = cname.value;
  }
  return [];
}

export { addressesOf };
