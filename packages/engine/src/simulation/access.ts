import type { Protocol, Transport } from '@server-planner/model';
import type { EngineContext } from '../context';
import type { EntityRef } from '../types';
import { ownerAttachments } from './network';
import { type ReachabilityResult, reach } from './reach';

/** Internet access per element (SIM-02) and the client view "Visible from" (SIM-03). */

export type InternetAccess = 'full' | 'partial' | 'none';

/** Probes for "has internet": web, plain HTTP, DNS and ping (docs/01 SIM-02). */
export const INTERNET_PROBES: { protocol: Protocol; port?: number }[] = [
  { protocol: 'tcp', port: 443 },
  { protocol: 'tcp', port: 80 },
  { protocol: 'udp', port: 53 },
  { protocol: 'icmp' },
];

function accessOf(ctx: EngineContext, from: EntityRef): InternetAccess | undefined {
  const results = INTERNET_PROBES.map((probe) => reach(ctx, { from, to: 'internet', ...probe }));
  if (results.every((r) => r.verdict === 'unknown')) return undefined;
  const ok = results.filter((r) => r.verdict === 'reachable').length;
  return ok === results.length ? 'full' : ok > 0 ? 'partial' : 'none';
}

/** Internet access of every device and VM/LXC with a network address; others are omitted. */
export function internetAccess(ctx: EngineContext): Record<string, InternetAccess> {
  const out: Record<string, InternetAccess> = {};
  for (const device of Object.values(ctx.project.devices)) {
    if (device.kind === 'internet' || ownerAttachments(ctx, device.id).length === 0) continue;
    const access = accessOf(ctx, { type: 'device', id: device.id });
    if (access) out[device.id] = access;
  }
  for (const w of Object.values(ctx.project.workloads)) {
    if (w.kind === 'container') continue;
    if (ownerAttachments(ctx, w.id).length === 0) continue;
    const access = accessOf(ctx, { type: 'workload', id: w.id });
    if (access) out[w.id] = access;
  }
  return out;
}

export interface ServiceVisibility {
  appId: string;
  /** Port as seen on the network (published host port for Docker bridge containers). */
  port: number;
  protocol: Transport;
  purpose?: string;
  result: ReachabilityResult;
}

/** Every app listener as seen from one client (SIM-03). */
export function visibleFrom(ctx: EngineContext, viewpoint: EntityRef): ServiceVisibility[] {
  const out: ServiceVisibility[] = [];
  for (const app of Object.values(ctx.project.apps)) {
    if (viewpoint.type === 'app' && viewpoint.id === app.id) continue;
    const container =
      app.runsOn.type === 'workload' ? ctx.project.workloads[app.runsOn.id] : undefined;
    for (const listener of app.listeners) {
      const published =
        container?.kind === 'container' && container.network.mode === 'docker-network'
          ? container.portMappings.find(
              (m) => m.containerPort === listener.port && m.protocol === listener.protocol,
            )?.hostPort
          : undefined;
      const port = published ?? listener.port;
      out.push({
        appId: app.id,
        port,
        protocol: listener.protocol,
        ...(listener.purpose ? { purpose: listener.purpose } : {}),
        result: reach(ctx, {
          from: viewpoint,
          to: { type: 'app', id: app.id },
          protocol: listener.protocol,
          port,
        }),
      });
    }
  }
  return out;
}
