import type { Project } from '../schema/project';

/**
 * Cascading removals that keep references consistent.
 * References from firewall rules, NAT, routes' interfaces, assertions, DNS/DHCP servers are left
 * in place on purpose: the engine reports them as broken instead of silently changing behaviour.
 */

export function removeLink(draft: Project, linkId: string): void {
  delete draft.links[linkId];
  delete draft.layout.links[linkId];
}

export function removeInterface(draft: Project, interfaceId: string): void {
  for (const link of Object.values(draft.links)) {
    if (link.a === interfaceId || link.b === interfaceId) removeLink(draft, link.id);
  }
  for (const child of Object.values(draft.interfaces)) {
    if (child.parentId !== interfaceId) continue;
    // VLAN sub-interfaces cannot exist without their parent; bridge members just leave the bridge.
    if (child.kind === 'vlan') removeInterface(draft, child.id);
    else delete child.parentId;
  }
  for (const network of Object.values(draft.dockerNetworks)) {
    if (network.parentInterfaceId === interfaceId) delete network.parentInterfaceId;
  }
  delete draft.interfaces[interfaceId];
}

export function removeApp(draft: Project, appId: string): void {
  delete draft.apps[appId];
  for (const app of Object.values(draft.apps)) {
    for (const dependency of app.dependencies) {
      if (dependency.satisfiedBy === appId) delete dependency.satisfiedBy;
    }
  }
}

export function removeWorkload(draft: Project, workloadId: string): void {
  // Delete first so a hosting cycle in (imported) data cannot recurse forever.
  if (!draft.workloads[workloadId]) return;
  delete draft.workloads[workloadId];
  removeHostedContent(draft, 'workload', workloadId);
}

export function removeDevice(draft: Project, deviceId: string): void {
  removeHostedContent(draft, 'device', deviceId);
  for (const route of Object.values(draft.routes)) {
    if (route.deviceId === deviceId) delete draft.routes[route.id];
  }
  delete draft.devices[deviceId];
  delete draft.layout.nodes[deviceId];
}

/** Everything that lives on a host: child workloads, apps, interfaces, Docker networks, stacks. */
function removeHostedContent(draft: Project, type: 'device' | 'workload', id: string): void {
  const isHost = (ref: { type: string; id: string }) => ref.type === type && ref.id === id;
  for (const workload of Object.values(draft.workloads)) {
    if (isHost(workload.host)) removeWorkload(draft, workload.id);
  }
  for (const app of Object.values(draft.apps)) {
    if (isHost(app.runsOn)) removeApp(draft, app.id);
  }
  for (const iface of Object.values(draft.interfaces)) {
    if (isHost(iface.owner) && draft.interfaces[iface.id]) removeInterface(draft, iface.id);
  }
  for (const network of Object.values(draft.dockerNetworks)) {
    if (isHost(network.host)) delete draft.dockerNetworks[network.id];
  }
  for (const stack of Object.values(draft.stacks)) {
    if (isHost(stack.host)) delete draft.stacks[stack.id];
  }
}
