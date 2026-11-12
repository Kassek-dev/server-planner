import type { FlowTarget } from '@server-planner/engine';
import type {
  AppInstance,
  Catalog,
  CatalogApp,
  CatalogFlow,
  PeerSelector,
  Project,
} from '@server-planner/model';

/**
 * Flows in the app (FLW-01/02): which apps of the project have catalog processes, and who can
 * play each role. The engine only runs the bound flow (`runFlow`).
 */

export interface FlowApp {
  app: AppInstance;
  entry: CatalogApp;
}

const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Apps of the project with catalog flows — one per catalog app and stack (the main instance). */
export function flowApps(project: Project, catalog: Catalog | null): FlowApp[] {
  if (!catalog) return [];
  const out: FlowApp[] = [];
  for (const app of Object.values(project.apps)) {
    // Catalog reference first; apps added by hand match a catalog app by name.
    const entry = app.catalogRef
      ? catalog.apps.find((a) => a.id === app.catalogRef?.id)
      : catalog.apps.find((a) => key(a.name) === key(app.name) || a.id === key(app.name));
    if (!entry || entry.flows.length === 0) continue;
    // Stack members share the catalog ref; the main instance carries the traffic patterns.
    const main = entry.deployment.components.length === 1 || app.trafficPatterns.length > 0;
    if (main) out.push({ app, entry });
  }
  return out.sort((a, b) => a.app.name.localeCompare(b.app.name));
}

export interface Candidate {
  value: string;
  label: string;
  target: FlowTarget;
}

const INFRA = new Set(['internet', 'switch', 'patch-panel', 'ups', 'modem', 'access-point']);
const STORAGE = /storage|nas|nfs|smb/;

/** The app running in the stack container built from a catalog component. */
export function componentApp(
  project: Project,
  entry: CatalogApp,
  self: AppInstance,
  key: string,
): AppInstance | undefined {
  const runtime = self.runsOn.type === 'workload' ? project.workloads[self.runsOn.id] : undefined;
  const component = entry.deployment.components.find((c) => c.key === key);
  if (runtime?.kind !== 'container' || !runtime.stackId || !component) return undefined;
  const container = Object.values(project.workloads).find(
    (w) =>
      w.kind === 'container' &&
      w.stackId === runtime.stackId &&
      w.image === component.image &&
      (w.name === component.name || w.name.startsWith(`${component.name}-`)),
  );
  return container
    ? Object.values(project.apps).find(
        (a) => a.runsOn.type === 'workload' && a.runsOn.id === container.id,
      )
    : undefined;
}

const appProvides = (catalog: Catalog | null, app: AppInstance) =>
  (app.catalogRef ? catalog?.apps.find((a) => a.id === app.catalogRef?.id)?.provides : undefined) ??
  [];

/** Who can play a role (FLW-02): candidates for a selector, best first. */
export function candidates(
  project: Project,
  catalog: Catalog | null,
  selector: PeerSelector | { kind: 'self' },
  self: FlowApp,
): Candidate[] {
  const device = (id: string, name: string, kind: string): Candidate => ({
    value: id,
    label: `${name} · ${kind}`,
    target: { type: 'device', id },
  });
  const app = (a: AppInstance): Candidate => ({
    value: a.id,
    label: `${a.name} · app`,
    target: { type: 'app', id: a.id },
  });
  const devices = Object.values(project.devices).sort((a, b) => a.name.localeCompare(b.name));
  switch (selector.kind) {
    case 'self':
      return [app(self.app)];
    case 'internet':
      return [{ value: 'internet', label: 'Internet', target: 'internet' }];
    case 'self-component': {
      const found = componentApp(project, self.entry, self.app, selector.key);
      return found ? [app(found)] : [];
    }
    case 'lan-clients':
      return [
        ...devices
          .filter((d) => d.kind === 'client')
          .map((d) => device(d.id, d.name, d.clientType ?? 'client')),
        ...devices
          .filter((d) => d.kind !== 'client' && !INFRA.has(d.kind))
          .map((d) => device(d.id, d.name, d.kind)),
      ];
    case 'device-kind':
      return devices
        .filter(
          (d) =>
            d.kind === selector.deviceKind &&
            (!selector.clientType || d.clientType === selector.clientType),
        )
        .map((d) => device(d.id, d.name, d.clientType ?? d.kind));
    case 'dns':
      return Object.values(project.apps)
        .filter((a) => a.role === 'dns' || appProvides(catalog, a).includes('dns'))
        .map(app);
    case 'dependency': {
      const apps = Object.values(project.apps)
        .filter(
          (a) => a.id !== self.app.id && appProvides(catalog, a).includes(selector.capability),
        )
        .map(app);
      const storage = STORAGE.test(selector.capability)
        ? devices.filter((d) => d.kind === 'nas').map((d) => device(d.id, d.name, d.kind))
        : [];
      return [...apps, ...storage];
    }
  }
}

/** Default participants: the first candidate of every role (FLW-02 suggestions). */
export function defaultBindings(
  project: Project,
  catalog: Catalog | null,
  flow: CatalogFlow,
  self: FlowApp,
): Record<string, string> {
  return Object.fromEntries(
    flow.roles.map((role) => [
      role.key,
      candidates(project, catalog, role.selector, self)[0]?.value ?? '',
    ]),
  );
}

export function targetOf(
  project: Project,
  catalog: Catalog | null,
  flow: CatalogFlow,
  self: FlowApp,
  roleKey: string,
  value: string,
): FlowTarget | undefined {
  const role = flow.roles.find((r) => r.key === roleKey);
  if (!role || !value) return undefined;
  return candidates(project, catalog, role.selector, self).find((c) => c.value === value)?.target;
}
