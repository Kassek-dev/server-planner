import type { Project } from '../schema/project';
import type { AppInstance, DockerNetwork, HostRef, Stack, Workload } from '../schema/workload';
import { removeApp, removeLink, removeWorkload } from './cascade';
import {
  applyChanges,
  CommandError,
  type DistributiveOmit,
  defineCommand,
  getOrThrow,
} from './core';

/** Workloads, stacks, Docker networks and apps — docs/02 § 5. */

function checkHost(draft: Project, host: HostRef, selfId?: string) {
  if (host.type === 'device') {
    getOrThrow(draft.devices, host.id, 'device');
    return;
  }
  getOrThrow(draft.workloads, host.id, 'workload');
  // A workload must not end up hosted (directly or indirectly) by itself.
  // Visited set also guards against cycles already present in imported data.
  const visited = new Set<string>();
  let current: HostRef | undefined = host;
  while (current?.type === 'workload') {
    if (current.id === selfId || visited.has(current.id)) {
      throw new CommandError('WORKLOAD_HOST_CYCLE', { id: current.id });
    }
    visited.add(current.id);
    current = draft.workloads[current.id]?.host;
  }
}

export const addWorkload = defineCommand(
  'workload.add',
  (draft, { workload }: { workload: DistributiveOmit<Workload, 'id'> }, ctx): string => {
    checkHost(draft, workload.host);
    if (workload.kind === 'container' && workload.stackId !== undefined) {
      getOrThrow(draft.stacks, workload.stackId, 'stack');
    }
    const id = ctx.createId('workload');
    draft.workloads[id] = { ...workload, id } as Workload;
    return id;
  },
);

export type WorkloadChanges = Partial<DistributiveOmit<Workload, 'id' | 'kind'>>;

export const updateWorkload = defineCommand(
  'workload.update',
  (draft, { id, changes }: { id: string; changes: WorkloadChanges }) => {
    const workload = getOrThrow(draft.workloads, id, 'workload');
    if (changes.host) checkHost(draft, changes.host, id);
    applyChanges(workload, changes as Partial<Workload>);
  },
);

/** The physical device at the bottom of a hosting chain (bounded walk, cycle-safe). */
function rootDevice(draft: Project, host: HostRef) {
  let current: HostRef | undefined = host;
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (current.type === 'device') return draft.devices[current.id];
    current = draft.workloads[current.id]?.host;
  }
  return undefined;
}

/** The workload and everything it hosts, transitively. */
function subtree(draft: Project, id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const w of Object.values(draft.workloads)) {
      if (w.host.type === 'workload' && ids.has(w.host.id) && !ids.has(w.id)) {
        ids.add(w.id);
        grew = true;
      }
    }
  }
  return ids;
}

/**
 * SW-11 moves a workload (with what it hosts) to another host, "on paper": vNICs are re-cabled to
 * the new device's bridge, disks and volumes go to its first pool when their pool is not there,
 * and a container leaves its stack and joins a Docker network of the new host (same name if any).
 * Whether the new host can run it is left to validation (VAL-11, VAL-13, VAL_ARCH).
 */
export const moveWorkload = defineCommand(
  'workload.move',
  (draft, { id, host }: { id: string; host: HostRef }, ctx) => {
    const workload = getOrThrow(draft.workloads, id, 'workload');
    if (workload.host.type === host.type && workload.host.id === host.id) return;
    checkHost(draft, host, id);
    const from = rootDevice(draft, workload.host);
    workload.host = { ...host };
    const to = rootDevice(draft, host);
    if (!to || to.id === from?.id) return;

    const pools = new Set(to.hardware.pools.map((p) => p.id));
    const fallbackPool = to.hardware.pools[0]?.id;
    const repool = (poolId: string) =>
      pools.has(poolId) || fallbackPool === undefined ? poolId : fallbackPool;
    const bridge = Object.values(draft.interfaces).find(
      (i) => i.owner.type === 'device' && i.owner.id === to.id && i.kind === 'bridge',
    );
    const moved = subtree(draft, id);
    for (const wid of moved) {
      const w = draft.workloads[wid];
      if (!w) continue;
      if (w.kind !== 'container') {
        for (const disk of w.resources.disks) disk.poolId = repool(disk.poolId);
      } else {
        for (const volume of w.volumes) if (volume.poolId) volume.poolId = repool(volume.poolId);
      }
      // vNICs cabled to a bridge of the old device follow to the new device's bridge.
      for (const nic of Object.values(draft.interfaces)) {
        if (nic.owner.type !== 'workload' || nic.owner.id !== wid) continue;
        for (const link of Object.values(draft.links)) {
          const peerId = link.a === nic.id ? link.b : link.b === nic.id ? link.a : undefined;
          const peer = peerId ? draft.interfaces[peerId] : undefined;
          if (peer?.owner.type !== 'device' || peer.owner.id === to.id) continue;
          removeLink(draft, link.id);
          if (bridge) {
            const linkId = ctx.createId('link');
            draft.links[linkId] = { ...link, id: linkId, a: nic.id, b: bridge.id };
          }
        }
      }
    }

    if (workload.kind === 'container') {
      const stack = workload.stackId ? draft.stacks[workload.stackId] : undefined;
      if (stack && (stack.host.type !== host.type || stack.host.id !== host.id))
        delete workload.stackId;
      if (workload.network.mode === 'docker-network') {
        const current = draft.dockerNetworks[workload.network.dockerNetworkId];
        const onHost = Object.values(draft.dockerNetworks).filter(
          (n) => n.host.type === host.type && n.host.id === host.id,
        );
        if (!current || current.host.type !== host.type || current.host.id !== host.id) {
          const target = onHost.find((n) => n.name === current?.name) ?? onHost[0];
          workload.network = target
            ? { mode: 'docker-network', dockerNetworkId: target.id }
            : { mode: 'none' };
        }
      }
    }
  },
);

/** Removes the workload with everything it hosts (nested workloads, apps, vNICs, networks). */
export const deleteWorkload = defineCommand('workload.delete', (draft, { id }: { id: string }) => {
  getOrThrow(draft.workloads, id, 'workload');
  removeWorkload(draft, id);
});

export const addStack = defineCommand(
  'stack.add',
  (draft, { stack }: { stack: Omit<Stack, 'id'> }, ctx): string => {
    checkHost(draft, stack.host);
    const id = ctx.createId('stack');
    draft.stacks[id] = { ...stack, id };
    return id;
  },
);

/** Removing a stack removes its containers (like `docker compose down` + removal). */
export const deleteStack = defineCommand('stack.delete', (draft, { id }: { id: string }) => {
  getOrThrow(draft.stacks, id, 'stack');
  for (const workload of Object.values(draft.workloads)) {
    if (workload.kind === 'container' && workload.stackId === id)
      removeWorkload(draft, workload.id);
  }
  delete draft.stacks[id];
});

export const addDockerNetwork = defineCommand(
  'dockerNetwork.add',
  (draft, { network }: { network: Omit<DockerNetwork, 'id'> }, ctx): string => {
    checkHost(draft, network.host);
    const id = ctx.createId('dockerNetwork');
    draft.dockerNetworks[id] = { ...network, id };
    const host =
      network.host.type === 'device'
        ? draft.devices[network.host.id]
        : draft.workloads[network.host.id];
    if (host && 'docker' in host && host.docker) host.docker.networkIds.push(id);
    return id;
  },
);

/** Containers attached to a removed network lose connectivity (mode `none`), they are not deleted. */
export const deleteDockerNetwork = defineCommand(
  'dockerNetwork.delete',
  (draft, { id }: { id: string }) => {
    getOrThrow(draft.dockerNetworks, id, 'dockerNetwork');
    for (const workload of Object.values(draft.workloads)) {
      if (workload.kind === 'container' && workload.network.mode === 'docker-network') {
        if (workload.network.dockerNetworkId === id) workload.network = { mode: 'none' };
      }
      if (workload.kind !== 'container' && workload.docker) {
        workload.docker.networkIds = workload.docker.networkIds.filter((n) => n !== id);
      }
    }
    for (const device of Object.values(draft.devices)) {
      if (device.docker)
        device.docker.networkIds = device.docker.networkIds.filter((n) => n !== id);
    }
    delete draft.dockerNetworks[id];
  },
);

export const addApp = defineCommand(
  'app.add',
  (draft, { app }: { app: Omit<AppInstance, 'id'> }, ctx): string => {
    checkHost(draft, app.runsOn);
    const id = ctx.createId('app');
    draft.apps[id] = { ...app, id };
    return id;
  },
);

export const updateApp = defineCommand(
  'app.update',
  (draft, { id, changes }: { id: string; changes: Partial<Omit<AppInstance, 'id'>> }) => {
    const app = getOrThrow(draft.apps, id, 'app');
    if (changes.runsOn) checkHost(draft, changes.runsOn);
    applyChanges(app, changes);
  },
);

export const deleteApp = defineCommand('app.delete', (draft, { id }: { id: string }) => {
  getOrThrow(draft.apps, id, 'app');
  removeApp(draft, id);
});
