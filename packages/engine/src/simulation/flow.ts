import type { CatalogFlow, Transport } from '@server-planner/model';
import type { EngineContext } from '../context';
import type { EntityRef } from '../types';
import { type ReachabilityResult, reach, type SimStep, subnetOf } from './reach';

/**
 * Application flows (FLW-01…05, docs/03 § 5.3): a catalog process expanded into a chain of
 * `reach()` calls, with a DNS hop before steps that resolve a name. Role bindings come from the
 * app (it knows the catalog); unbound optional steps are skipped.
 */

export type FlowTarget = EntityRef | 'internet';

export interface FlowHop {
  /** Index of the catalog step this hop belongs to. */
  step: number;
  kind: 'dns' | 'step';
  from: FlowTarget;
  to: FlowTarget;
  protocol: Transport;
  port?: number;
  bandwidthMbps?: number;
  result: ReachabilityResult;
}

export interface FlowRunResult {
  flowId: string;
  hops: FlowHop[];
  /** Optional steps left out because their role has no participant. */
  skipped: number[];
  verdict: 'reachable' | 'blocked' | 'unknown';
}

const unknown = (
  code: string,
  ref: EntityRef,
  params: SimStep['params'] = {},
): ReachabilityResult => ({
  verdict: 'unknown',
  steps: [{ ref, layer: 'l3', decision: 'fail', code, params }],
  blockedAt: 0,
  path: { devices: [], links: [] },
});

/** Port on the network for a listener of an app: the published host port for bridged containers. */
function listenerPort(
  ctx: EngineContext,
  appId: string,
  purpose: string,
  protocol: Transport,
): number | undefined {
  const app = ctx.project.apps[appId];
  const listener =
    app?.listeners.find((l) => l.purpose === purpose && l.protocol === protocol) ??
    app?.listeners.find((l) => l.purpose === purpose);
  if (!app || !listener) return undefined;
  const runtime = app.runsOn.type === 'workload' ? ctx.project.workloads[app.runsOn.id] : undefined;
  if (runtime?.kind === 'container' && runtime.network.mode === 'docker-network') {
    return (
      runtime.portMappings.find(
        (m) => m.containerPort === listener.port && m.protocol === listener.protocol,
      )?.hostPort ?? listener.port
    );
  }
  return listener.port;
}

/** DNS server of the subnet the source sits in (an app or the owner of the server's address). */
function dnsServer(ctx: EngineContext, from: EntityRef): EntityRef | undefined {
  const subnetId = subnetOf(ctx, from);
  const server = subnetId ? ctx.project.subnets[subnetId]?.dns?.servers[0] : undefined;
  if (!server) return undefined;
  if (server.type === 'app')
    return ctx.project.apps[server.id] ? { type: 'app', id: server.id } : undefined;
  const iface = Object.values(ctx.project.interfaces).find((i) =>
    i.addresses.some((a) => a.address === server.value),
  );
  return iface ? { type: iface.owner.type, id: iface.owner.id } : undefined;
}

export function runFlow(
  ctx: EngineContext,
  { flow, bindings }: { flow: CatalogFlow; bindings: Record<string, FlowTarget | undefined> },
): FlowRunResult {
  const hops: FlowHop[] = [];
  const skipped: number[] = [];
  flow.steps.forEach((step, index) => {
    const from = bindings[step.from];
    const to = bindings[step.to];
    const base = {
      step: index,
      protocol: step.protocol,
      ...(step.bandwidthMbps !== undefined ? { bandwidthMbps: step.bandwidthMbps } : {}),
    };
    if (!from || !to) {
      if (step.optional) {
        skipped.push(index);
        return;
      }
      const role = !from ? step.from : step.to;
      hops.push({
        ...base,
        kind: 'step',
        from: from ?? 'internet',
        to: to ?? 'internet',
        result: unknown('SIM_FLOW_UNBOUND', { type: 'app', id: role }, { role }),
      });
      return;
    }
    if (from === 'internet') {
      hops.push({
        ...base,
        kind: 'step',
        from,
        to,
        result: unknown('SIM_FROM_INTERNET', to === 'internet' ? { type: 'device', id: '' } : to),
      });
      return;
    }
    if (step.resolveDns) {
      const dns = dnsServer(ctx, from);
      if (dns)
        hops.push({
          step: index,
          kind: 'dns',
          from,
          to: dns,
          protocol: 'udp',
          port: 53,
          result: reach(ctx, { from, to: dns, protocol: 'udp', port: 53 }),
        });
    }
    const port =
      step.port ??
      (to !== 'internet' && to.type === 'app' && step.purpose
        ? listenerPort(ctx, to.id, step.purpose, step.protocol)
        : undefined);
    hops.push({
      ...base,
      kind: 'step',
      from,
      to,
      ...(port !== undefined ? { port } : {}),
      result: reach(ctx, {
        from,
        to,
        protocol: step.protocol,
        ...(port !== undefined ? { port } : {}),
      }),
    });
  });
  const verdicts = hops.map((h) => h.result.verdict);
  return {
    flowId: flow.id,
    hops,
    skipped,
    verdict: verdicts.includes('blocked')
      ? 'blocked'
      : verdicts.includes('unknown')
        ? 'unknown'
        : 'reachable',
  };
}
