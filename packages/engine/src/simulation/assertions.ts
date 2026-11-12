import type { Assertion, Endpoint, Protocol } from '@server-planner/model';
import type { EngineContext } from '../context';
import type { EntityRef } from '../types';
import { cidrWithin, ipInCidr, ownerAttachments } from './network';
import { exposure, type ReachabilityResult, reach } from './reach';

/**
 * Network assertions (SIM-06) and the access matrix (SIM-04): zones, subnets and other endpoint
 * sets are represented by the devices and VMs/LXCs inside them; `reach()` decides each pair.
 */

export type Verdict = 'reachable' | 'blocked' | 'unknown';
type Target = EntityRef | 'internet';

/** Most pairs evaluated per assertion or matrix cell — keeps big projects responsive. */
const MAX_PAIRS = 24;

interface Member {
  ref: EntityRef;
  zones: Set<string>;
  subnets: Set<string>;
  ips: string[];
}

/** Network infrastructure sits in every zone it routes for — never a representative of one. */
const INFRA = new Set([
  'internet',
  'router',
  'firewall',
  'switch',
  'access-point',
  'modem',
  'patch-panel',
  'ups',
]);

/** Devices and VMs/LXCs with a network address — the endpoints sets are made of. */
function members(ctx: EngineContext): Member[] {
  const out: Member[] = [];
  const add = (ref: EntityRef, ownerId: string) => {
    const atts = ownerAttachments(ctx, ownerId);
    if (atts.length === 0) return;
    out.push({
      ref,
      zones: new Set(atts.map((a) => a.zoneId).filter((z): z is string => !!z)),
      subnets: new Set(atts.map((a) => a.subnetId).filter((s): s is string => !!s)),
      ips: atts.map((a) => a.ip).filter((ip): ip is string => !!ip),
    });
  };
  for (const d of Object.values(ctx.project.devices))
    if (!INFRA.has(d.kind)) add({ type: 'device', id: d.id }, d.id);
  for (const w of Object.values(ctx.project.workloads))
    if (w.kind !== 'container') add({ type: 'workload', id: w.id }, w.id);
  return out;
}

export function endpointsOf(ctx: EngineContext, endpoint: Endpoint, all = members(ctx)): Target[] {
  switch (endpoint.type) {
    case 'internet':
      return ['internet'];
    case 'device':
    case 'workload':
    case 'app':
      return [{ type: endpoint.type, id: endpoint.id }];
    case 'any':
      return all.map((m) => m.ref);
    case 'zone': {
      if (ctx.project.zones[endpoint.id]?.kind === 'wan') return ['internet'];
      return all.filter((m) => m.zones.has(endpoint.id)).map((m) => m.ref);
    }
    case 'subnet':
      return all.filter((m) => m.subnets.has(endpoint.id)).map((m) => m.ref);
    case 'cidr':
      return all
        .filter(
          (m) =>
            m.ips.some((ip) => ipInCidr(ip, endpoint.value)) ||
            [...m.subnets].some((s) => {
              const cidr = ctx.project.subnets[s]?.cidr;
              return !!cidr && cidrWithin(cidr, endpoint.value);
            }),
        )
        .map((m) => m.ref);
  }
}

const same = (a: Target, b: Target) =>
  a === b || (a !== 'internet' && b !== 'internet' && a.type === b.type && a.id === b.id);

/** The device a target ends up on (to match port forwards to their destination set). */
function deviceOfTarget(ctx: EngineContext, t: Target): string | undefined {
  if (t === 'internet') return undefined;
  if (t.type === 'device') return t.id;
  if (t.type === 'workload') return ctx.deviceOfWorkload.get(t.id)?.id;
  if (t.type === 'app') {
    const app = ctx.project.apps[t.id];
    return app?.runsOn.type === 'device'
      ? app.runsOn.id
      : app
        ? ctx.deviceOfWorkload.get(app.runsOn.id)?.id
        : undefined;
  }
  return undefined;
}

export interface PairsResult {
  verdict: Verdict;
  /** A reachable pair if any, else the first evaluated one. */
  example?: ReachabilityResult;
  pairs: number;
}

/** Can anything in `sources` reach anything in `destinations` (any pair reachable → reachable)? */
export function reachSets(
  ctx: EngineContext,
  sources: Target[],
  destinations: Target[],
  protocol: Protocol,
  port?: number,
): PairsResult {
  const results: ReachabilityResult[] = [];
  if (sources.includes('internet')) {
    // Inbound from the internet = port forwards landing in the destination set (SIM-05).
    const devices = new Set(destinations.map((d) => deviceOfTarget(ctx, d)).filter(Boolean));
    for (const e of exposure(ctx)) {
      if (port !== undefined && e.externalPort !== port) continue;
      if (protocol !== 'any' && protocol !== e.protocol) continue;
      if (
        e.target &&
        (destinations.some((d) => same(d, e.target as Target)) ||
          devices.has(deviceOfTarget(ctx, e.target)))
      )
        results.push(e.result);
    }
    if (results.length === 0) return { verdict: 'blocked', pairs: 0 };
  } else {
    outer: for (const from of sources) {
      if (from === 'internet') continue;
      for (const to of destinations) {
        if (same(from, to)) continue;
        results.push(reach(ctx, { from, to, protocol, ...(port !== undefined ? { port } : {}) }));
        if (results.length >= MAX_PAIRS) break outer;
      }
    }
  }
  const hit = results.find((r) => r.verdict === 'reachable');
  const verdict: Verdict = hit
    ? 'reachable'
    : results.some((r) => r.verdict === 'blocked')
      ? 'blocked'
      : 'unknown';
  const example = hit ?? results[0];
  return { verdict, pairs: results.length, ...(example ? { example } : {}) };
}

export interface AssertionResult {
  assertionId: string;
  actual: Verdict;
  /** null when the project cannot tell (no endpoints, no addresses). */
  passed: boolean | null;
  example?: ReachabilityResult;
}

export function evaluateAssertion(
  ctx: EngineContext,
  a: Assertion,
  all = members(ctx),
): AssertionResult {
  const result = reachSets(
    ctx,
    endpointsOf(ctx, a.source, all),
    endpointsOf(ctx, a.destination, all),
    a.protocol,
    a.port,
  );
  return {
    assertionId: a.id,
    actual: result.verdict,
    passed: result.verdict === 'unknown' ? null : result.verdict === a.expect,
    ...(result.example ? { example: result.example } : {}),
  };
}

export function evaluateAssertions(ctx: EngineContext): AssertionResult[] {
  const all = members(ctx);
  return Object.values(ctx.project.assertions)
    .filter((a) => a.enabled)
    .map((a) => evaluateAssertion(ctx, a, all));
}

/** Probes behind a matrix cell: web, plain HTTP, SSH, DNS and ping. */
export const MATRIX_PROBES: { protocol: Protocol; port?: number }[] = [
  { protocol: 'tcp', port: 443 },
  { protocol: 'tcp', port: 80 },
  { protocol: 'tcp', port: 22 },
  { protocol: 'udp', port: 53 },
  { protocol: 'icmp' },
];

export interface MatrixCell {
  status: 'full' | 'partial' | 'none' | 'unknown';
  /** Probes that got through, of `MATRIX_PROBES.length`. */
  allowed: number;
  example?: ReachabilityResult;
}

export interface AccessMatrix {
  axis: { key: string; label: string; endpoint: Endpoint }[];
  /** cells[from][to] */
  cells: MatrixCell[][];
}

function cell(ctx: EngineContext, sources: Target[], destinations: Target[]): MatrixCell {
  if (sources.length === 0 || destinations.length === 0) return { status: 'unknown', allowed: 0 };
  // One representative per side keeps the matrix O(n²·probes).
  const from = sources.slice(0, 1);
  const to = destinations.filter((d) => !from.some((f) => same(f, d))).slice(0, 1);
  if (to.length === 0) return { status: 'unknown', allowed: 0 };
  const results = MATRIX_PROBES.map((p) => reachSets(ctx, from, to, p.protocol, p.port));
  const allowed = results.filter((r) => r.verdict === 'reachable').length;
  const known = results.filter((r) => r.verdict !== 'unknown').length;
  const example = results.find((r) => r.verdict === 'reachable')?.example ?? results[0]?.example;
  const status =
    known === 0
      ? 'unknown'
      : allowed === 0
        ? 'none'
        : allowed === MATRIX_PROBES.length
          ? 'full'
          : 'partial';
  return { status, allowed, ...(example ? { example } : {}) };
}

/** Zone × zone (internal zones plus the internet), or element × element for the given refs. */
export function accessMatrix(ctx: EngineContext, refs?: EntityRef[]): AccessMatrix {
  const all = members(ctx);
  const axis: AccessMatrix['axis'] = refs
    ? refs.map((r) => ({
        key: `${r.type}:${r.id}`,
        label:
          (r.type === 'device'
            ? ctx.project.devices[r.id]?.name
            : r.type === 'workload'
              ? ctx.project.workloads[r.id]?.name
              : ctx.project.apps[r.id]?.name) ?? r.id,
        endpoint: { type: r.type as 'device' | 'workload' | 'app', id: r.id },
      }))
    : [
        ...Object.values(ctx.project.zones)
          .filter((z) => z.kind !== 'wan')
          .map((z) => ({
            key: z.id,
            label: z.name,
            endpoint: { type: 'zone' as const, id: z.id },
          })),
        { key: 'internet', label: 'Internet', endpoint: { type: 'internet' as const } },
      ];
  const sets = axis.map((a) => endpointsOf(ctx, a.endpoint, all));
  const cells = axis.map((_, i) =>
    axis.map((__, j) => {
      if (i === j && !refs) {
        const zone = ctx.project.zones[axis[i]?.key ?? ''];
        // Inside a zone: what the zone policy allows between its members (if there are two).
        return zone
          ? cell(ctx, sets[i] ?? [], (sets[j] ?? []).slice(1))
          : { status: 'unknown' as const, allowed: 0 };
      }
      if (i === j) return { status: 'unknown' as const, allowed: 0 };
      return cell(ctx, sets[i] ?? [], sets[j] ?? []);
    }),
  );
  return { axis, cells };
}
