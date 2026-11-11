import type { Project } from '../schema/project';
import type { AppInstance, DockerNetwork, HostRef, Stack, Workload } from '../schema/workload';
import { removeApp, removeWorkload } from './cascade';
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
  let current: HostRef | undefined = host;
  while (current?.type === 'workload') {
    if (current.id === selfId) throw new CommandError('WORKLOAD_HOST_CYCLE', { id: current.id });
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
