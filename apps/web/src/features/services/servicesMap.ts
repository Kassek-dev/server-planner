import type { Id, Project } from '@server-planner/model';

/**
 * VIEW-07 services map: host names (reverse proxy routes, local DNS records), apps and what they
 * depend on, laid out in columns from the names people type to the services at the bottom of the
 * stack. A pure function of the project — the view only draws it.
 */

export type ServiceNode =
  | {
      kind: 'name';
      id: string;
      name: string;
      /** Addresses of the local A records with this name. */
      addresses: string[];
      /** Device or workload the A record points to, when it is not a single app. */
      host?: string | undefined;
      /** DNS app that answers the name, if a record names one. */
      dnsAppId?: Id;
      column: number;
      row: number;
    }
  | {
      kind: 'app';
      id: Id;
      name: string;
      /** Where it runs: workload and device names, innermost first. */
      host: string[];
      role?: string;
      ports: string[];
      column: number;
      row: number;
    }
  | { kind: 'missing'; id: string; capability: string; column: number; row: number };

export interface ServiceEdge {
  from: string;
  to: string;
  kind: 'route' | 'record' | 'dependency' | 'missing';
  /** Route target port or dependency capability. */
  label?: string;
}

export interface ServicesMap {
  nodes: ServiceNode[];
  edges: ServiceEdge[];
  columns: number;
  rows: number;
}

/** Workload and device names an app runs on, innermost first (bounded walk). */
function hostPath(project: Project, appId: Id): { names: string[]; owners: Set<Id> } {
  const names: string[] = [];
  const owners = new Set<Id>();
  let ref: { type: string; id: Id } | undefined = project.apps[appId]?.runsOn;
  for (let depth = 0; ref && depth < 8; depth += 1) {
    owners.add(ref.id);
    if (ref.type === 'device') {
      names.push(project.devices[ref.id]?.name ?? '?');
      break;
    }
    const workload = project.workloads[ref.id];
    names.push(workload?.name ?? '?');
    ref = workload?.host;
  }
  return { names, owners };
}

export function servicesMap(project: Project): ServicesMap {
  const apps = Object.values(project.apps);
  const hosts = new Map(apps.map((a) => [a.id, hostPath(project, a.id)]));
  const edges: ServiceEdge[] = [];
  const names = new Map<string, Extract<ServiceNode, { kind: 'name' }>>();
  const nameNode = (name: string) => {
    let node = names.get(name);
    if (!node) {
      node = { kind: 'name', id: `name:${name}`, name, addresses: [], column: 0, row: 0 };
      names.set(name, node);
    }
    return node;
  };

  for (const route of Object.values(project.proxyRoutes)) {
    if (!project.apps[route.proxyAppId] || !project.apps[route.target.appId]) continue;
    const node = nameNode(route.hostname);
    edges.push({ from: node.id, to: route.proxyAppId, kind: 'route' });
    edges.push({
      from: route.proxyAppId,
      to: route.target.appId,
      kind: 'route',
      label: String(route.target.port),
    });
  }
  // Owner (device or workload) of each address, for A records.
  const ownerOf = new Map<string, Id>();
  for (const iface of Object.values(project.interfaces))
    for (const a of iface.addresses) if (a.address) ownerOf.set(a.address, iface.owner.id);
  const addressed = new Set(ownerOf.values());
  /** The innermost workload or device on an app's path that has an address of its own. */
  const addressOwner = (appId: Id) =>
    [...(hosts.get(appId)?.owners ?? [])].find((id) => addressed.has(id));
  for (const record of Object.values(project.dnsRecords)) {
    const node = nameNode(record.name);
    if (record.serverAppId && project.apps[record.serverAppId]) node.dnsAppId = record.serverAppId;
    if (record.type === 'CNAME') {
      edges.push({ from: node.id, to: nameNode(record.value).id, kind: 'record' });
      continue;
    }
    node.addresses.push(record.value);
    // A name behind a route already leads to the proxy; otherwise to the app at that address when
    // there is exactly one (a host running several apps is named in the node instead).
    if (Object.values(project.proxyRoutes).some((r) => r.hostname === record.name)) continue;
    const owner = ownerOf.get(record.value);
    if (!owner) continue;
    const at = apps.filter((app) => addressOwner(app.id) === owner);
    const only = at[0];
    if (at.length === 1 && only) edges.push({ from: node.id, to: only.id, kind: 'record' });
    else node.host = project.devices[owner]?.name ?? project.workloads[owner]?.name;
  }

  const missing: Extract<ServiceNode, { kind: 'missing' }>[] = [];
  for (const app of apps)
    for (const dep of app.dependencies) {
      if (dep.satisfiedBy && project.apps[dep.satisfiedBy])
        edges.push({
          from: app.id,
          to: dep.satisfiedBy,
          kind: 'dependency',
          label: dep.capability,
        });
      else if (!dep.optional) {
        const id = `missing:${app.id}:${dep.capability}`;
        missing.push({ kind: 'missing', id, capability: dep.capability, column: 0, row: 0 });
        edges.push({ from: app.id, to: id, kind: 'missing', label: dep.capability });
      }
    }

  // Column = longest chain of edges leading to a node (names first); cycles stop after a bound.
  const ids = [...names.keys()].map((n) => `name:${n}`);
  const all = [...ids, ...apps.map((a) => a.id), ...missing.map((m) => m.id)];
  const column = new Map(all.map((id) => [id, 0]));
  for (let pass = 0; pass < all.length; pass += 1) {
    let changed = false;
    for (const e of edges) {
      const next = (column.get(e.from) ?? 0) + 1;
      if (next > (column.get(e.to) ?? 0) && next <= all.length) {
        column.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Apps never come before the names column.
  for (const app of apps)
    column.set(app.id, Math.max(column.get(app.id) ?? 0, ids.length > 0 ? 1 : 0));

  const nodes: ServiceNode[] = [
    ...names.values(),
    ...apps.map(
      (app): ServiceNode => ({
        kind: 'app',
        id: app.id,
        name: app.name,
        host: hosts.get(app.id)?.names ?? [],
        ...(app.role ? { role: app.role } : {}),
        ports: app.listeners.map((l) => `${l.port}/${l.protocol}`),
        column: 0,
        row: 0,
      }),
    ),
    ...missing,
  ];
  // Rows: within a column, grouped by host (device, then workload), then by name.
  const sortKey = (n: ServiceNode) =>
    n.kind === 'app'
      ? `1 ${[...n.host].reverse().join(' / ')} ${n.name}`
      : n.kind === 'name'
        ? `0 ${n.name}`
        : `2 ${n.capability}`;
  const byColumn = new Map<number, ServiceNode[]>();
  for (const node of nodes) {
    node.column = column.get(node.id) ?? 0;
    byColumn.set(node.column, [...(byColumn.get(node.column) ?? []), node]);
  }
  let rows = 0;
  for (const list of byColumn.values()) {
    list.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    list.forEach((node, i) => {
      node.row = i;
    });
    rows = Math.max(rows, list.length);
  }
  // Empty columns (a chain that skips one) are squeezed out.
  const used = [...byColumn.keys()].sort((a, b) => a - b);
  for (const node of nodes) node.column = used.indexOf(node.column);
  return { nodes, edges, columns: used.length, rows };
}
