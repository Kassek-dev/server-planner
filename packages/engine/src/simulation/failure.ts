import type { Id, Project } from '@server-planner/model';
import { capacity } from '../capacity';
import { buildContext, type EngineContext, type EngineOptions } from '../context';
import { power } from '../power';
import { internetAccess } from './access';
import { evaluateAssertions } from './assertions';
import { reach } from './reach';

/**
 * SIM-07 failure analysis: "what if X fails?" and single points of failure. A failed device has
 * every interface down (and so does everything it hosts); a failed cable is unplugged; a power cut
 * leaves only devices behind a UPS (and the Internet) running. The project is compared before and
 * after on internet access, which clients still reach each app, and network assertions.
 */

export interface FailureScenario {
  devices: Id[];
  links: Id[];
  /** Mains power is lost: devices not protected by a UPS go down too. */
  powerCut?: boolean;
}

export interface AppImpact {
  appId: Id;
  /** The app runs on a failed device. */
  down: boolean;
  /** Clients that reached the app before and do not now. */
  lostClients: Id[];
}

export interface FailureImpact {
  /** Devices that are down, including those cut off by a power cut. */
  failedDevices: Id[];
  failedLinks: Id[];
  /** Devices and VMs/LXC (still running) that had internet access and lost it. */
  internetLost: Id[];
  apps: AppImpact[];
  /** Assertions whose result changes. */
  assertions: { assertionId: Id; before: boolean | null; after: boolean | null }[];
}

export interface SinglePointOfFailure {
  ref: { type: 'device' | 'link'; id: Id };
  impact: FailureImpact;
  /**
   * `endpoint`: the failure only cuts off the element itself — a device with what it hosts, or the
   * single cable of a device and that device; `infrastructure`: it cuts off anything else.
   */
  scope: 'infrastructure' | 'endpoint';
}

/** Device a workload or app finally runs on (bounded walk). */
function hostDevice(project: Project, ref: { type: string; id: Id }): Id | undefined {
  let current: { type: string; id: Id } | undefined = ref;
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (current.type === 'device') return current.id;
    if (current.type === 'app') current = project.apps[current.id]?.runsOn;
    else current = project.workloads[current.id]?.host;
  }
  return undefined;
}

/** The project with failed devices switched off and failed cables removed. */
function withFailures(project: Project, devices: Set<Id>, links: Set<Id>): Project {
  const down = (owner: { type: string; id: Id }) => {
    const device = hostDevice(project, owner);
    return device !== undefined && devices.has(device);
  };
  const interfaces = Object.fromEntries(
    Object.entries(project.interfaces).map(([id, iface]) => [
      id,
      down(iface.owner) ? { ...iface, enabled: false } : iface,
    ]),
  );
  const kept = Object.fromEntries(Object.entries(project.links).filter(([id]) => !links.has(id)));
  return { ...project, interfaces, links: kept };
}

/** Clients whose view of the apps matters: client devices, else every non-internet device. */
function clientsOf(project: Project): Id[] {
  const devices = Object.values(project.devices).filter((d) => d.kind !== 'internet');
  const clients = devices.filter((d) => d.kind === 'client');
  return (clients.length > 0 ? clients : devices).map((d) => d.id);
}

/** Which clients reach each app on its first listener. */
function appReach(ctx: EngineContext, clients: Id[]): Map<Id, Set<Id>> {
  const out = new Map<Id, Set<Id>>();
  for (const app of Object.values(ctx.project.apps)) {
    const listener = app.listeners[0];
    if (!listener) continue;
    const host = hostDevice(ctx.project, { type: 'app', id: app.id });
    const reached = new Set<Id>();
    for (const client of clients) {
      if (client === host) continue;
      const result = reach(ctx, {
        from: { type: 'device', id: client },
        to: { type: 'app', id: app.id },
        protocol: listener.protocol,
        port: listener.port,
      });
      if (result.verdict === 'reachable') reached.add(client);
    }
    out.set(app.id, reached);
  }
  return out;
}

interface Baseline {
  internet: Record<Id, string>;
  apps: Map<Id, Set<Id>>;
  assertions: Map<Id, boolean | null>;
  clients: Id[];
}

function baselineOf(ctx: EngineContext): Baseline {
  const clients = clientsOf(ctx.project);
  return {
    internet: internetAccess(ctx),
    apps: appReach(ctx, clients),
    assertions: new Map(evaluateAssertions(ctx).map((a) => [a.assertionId, a.passed])),
    clients,
  };
}

/** Devices that keep running in a power cut: UPS units, what they protect, and the Internet. */
function poweredInCut(ctx: EngineContext): Set<Id> {
  const report = power(ctx, capacity(ctx, 'expected'));
  const on = new Set<Id>();
  for (const ups of report.ups) {
    on.add(ups.deviceId);
    for (const id of ups.protected) on.add(id);
  }
  for (const device of Object.values(ctx.project.devices))
    if (device.kind === 'internet') on.add(device.id);
  return on;
}

function impactOf(
  ctx: EngineContext,
  base: Baseline,
  scenario: FailureScenario,
  options: EngineOptions,
): FailureImpact {
  const p = ctx.project;
  const devices = new Set(scenario.devices.filter((id) => p.devices[id]));
  if (scenario.powerCut) {
    const on = poweredInCut(ctx);
    for (const id of Object.keys(p.devices)) if (!on.has(id)) devices.add(id);
  }
  const links = new Set(scenario.links.filter((id) => p.links[id]));
  const after = buildContext(withFailures(p, devices, links), options);

  const isDown = (ref: { type: string; id: Id }) => {
    const host = hostDevice(p, ref);
    return host !== undefined && devices.has(host);
  };
  const internetNow = internetAccess(after);
  const internetLost = Object.entries(base.internet)
    .filter(([id, access]) => {
      if (access === 'none') return false;
      if (isDown({ type: p.devices[id] ? 'device' : 'workload', id })) return false;
      return (internetNow[id] ?? 'none') === 'none';
    })
    .map(([id]) => id);

  const appsNow = appReach(
    after,
    base.clients.filter((c) => !devices.has(c)),
  );
  const apps: AppImpact[] = [];
  for (const [appId, before] of base.apps) {
    const down = isDown({ type: 'app', id: appId });
    const now = appsNow.get(appId) ?? new Set<Id>();
    const lostClients = [...before].filter((c) => !devices.has(c) && !now.has(c));
    if (down || lostClients.length > 0) apps.push({ appId, down, lostClients });
  }

  const assertions = evaluateAssertions(after)
    .map((a) => ({
      assertionId: a.assertionId,
      before: base.assertions.get(a.assertionId) ?? null,
      after: a.passed,
    }))
    .filter((a) => a.before !== a.after);

  return {
    failedDevices: [...devices],
    failedLinks: [...links],
    internetLost,
    apps,
    assertions,
  };
}

/** "What if X fails?" on a project snapshot (worker entry point). */
export function failureImpact(
  project: Project,
  scenario: FailureScenario,
  options: EngineOptions = {},
): FailureImpact {
  const ctx = buildContext(project, options);
  return impactOf(ctx, baselineOf(ctx), scenario, options);
}

/** An impact beyond the failed element itself: lost internet, or clients cut off from apps elsewhere. */
export function affectsOthers(impact: FailureImpact): boolean {
  return impact.internetLost.length > 0 || impact.apps.some((a) => a.lostClients.length > 0);
}

/** Devices, workloads and apps that are the given devices or run on them. */
function ownedBy(project: Project, devices: Set<Id>): Set<Id> {
  const own = new Set<Id>(devices);
  for (const w of Object.keys(project.workloads)) {
    const host = hostDevice(project, { type: 'workload', id: w });
    if (host && devices.has(host)) own.add(w);
  }
  for (const a of Object.keys(project.apps)) {
    const host = hostDevice(project, { type: 'app', id: a });
    if (host && devices.has(host)) own.add(a);
  }
  return own;
}

/** Devices whose only physical cable is the given one (cut off with it). */
function leafEnds(project: Project, linkId: Id): Set<Id> {
  const link = project.links[linkId];
  const deviceOf = (ifaceId: Id) => {
    const owner = project.interfaces[ifaceId]?.owner;
    return owner?.type === 'device' ? owner.id : undefined;
  };
  const cables = new Map<Id, number>();
  for (const l of Object.values(project.links)) {
    if (l.medium === 'virtual') continue;
    for (const end of [l.a, l.b]) {
      const d = deviceOf(end);
      if (d) cables.set(d, (cables.get(d) ?? 0) + 1);
    }
  }
  const ends = new Set<Id>();
  for (const end of link ? [link.a, link.b] : []) {
    const d = deviceOf(end);
    if (d && cables.get(d) === 1 && project.devices[d]?.kind !== 'internet') ends.add(d);
  }
  return ends;
}

function scopeOf(
  project: Project,
  ref: SinglePointOfFailure['ref'],
  impact: FailureImpact,
): SinglePointOfFailure['scope'] {
  const own = ownedBy(
    project,
    ref.type === 'device' ? new Set([ref.id]) : leafEnds(project, ref.id),
  );
  const beyond =
    impact.internetLost.some((id) => !own.has(id)) ||
    impact.apps.some((a) => !own.has(a.appId) && a.lostClients.some((c) => !own.has(c)));
  return beyond ? 'infrastructure' : 'endpoint';
}

/**
 * Single points of failure: every device (except clients and the Internet) and every physical
 * cable whose failure alone cuts something else off; most damaging first.
 */
export function singlePointsOfFailure(
  project: Project,
  options: EngineOptions = {},
): SinglePointOfFailure[] {
  const ctx = buildContext(project, options);
  const base = baselineOf(ctx);
  const candidates: SinglePointOfFailure['ref'][] = [
    ...Object.values(project.devices)
      .filter((d) => d.kind !== 'internet' && d.kind !== 'client')
      .map((d) => ({ type: 'device' as const, id: d.id })),
    ...Object.values(project.links)
      .filter((l) => l.medium !== 'virtual')
      .map((l) => ({ type: 'link' as const, id: l.id })),
  ];
  const score = (i: FailureImpact) =>
    i.internetLost.length + i.apps.reduce((s, a) => s + a.lostClients.length, 0);
  return candidates
    .map((ref) => ({
      ref,
      impact: impactOf(
        ctx,
        base,
        ref.type === 'device' ? { devices: [ref.id], links: [] } : { devices: [], links: [ref.id] },
        options,
      ),
    }))
    .filter((s) => affectsOthers(s.impact))
    .map((s) => ({ ...s, scope: scopeOf(project, s.ref, s.impact) }))
    .sort((a, b) => score(b.impact) - score(a.impact));
}
