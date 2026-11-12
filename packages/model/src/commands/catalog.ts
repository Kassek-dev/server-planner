import { clone } from '../clone';
import type { ModelContext } from '../factories';
import { checkRackFit } from '../rack';
import type { CatalogApp, CatalogDevice } from '../schema/catalog';
import type { Bytes } from '../schema/common';
import type { Interface } from '../schema/network';
import type { Project } from '../schema/project';
import type { AppInstance, HostRef, PortMapping, Workload } from '../schema/workload';
import { removeInterface } from './cascade';
import { CommandError, defineCommand, getOrThrow } from './core';

/** Catalog → project (LIB-01/03, SW-06): catalog entries are copied, with `catalogRef` (docs/02 Z7). */

const PHYSICAL: readonly Interface['kind'][] = [
  'rj45',
  'sfp',
  'sfp+',
  'sfp28',
  'qsfp+',
  'wifi-radio',
  'wan',
];

/**
 * `device.applyModel` (D-05): hardware, ports, form factor and switching from a catalog model.
 * Physical ports are matched by position — cables and addresses on kept ports survive; extra
 * old ports are removed only when nothing is connected to them. Disks are added only to a device
 * without disks (pools reference them). A rack device whose new size no longer fits leaves its slot.
 */
export const applyDeviceModel = defineCommand(
  'device.applyModel',
  (
    draft,
    { id, model, catalogVersion }: { id: string; model: CatalogDevice; catalogVersion: string },
    ctx,
  ) => {
    const device = getOrThrow(draft.devices, id, 'device');
    if (device.kind !== model.kind)
      throw new CommandError('MODEL_KIND_MISMATCH', { kind: device.kind, model: model.kind });

    device.catalogRef = { id: model.id, version: catalogVersion };
    const { defaultDisks, ...hardware } = clone(model.hardware);
    device.hardware.cpus = hardware.cpus;
    device.hardware.gpus = hardware.gpus;
    if (hardware.memory) device.hardware.memory = hardware.memory;
    else delete device.hardware.memory;
    if (hardware.power) device.hardware.power = hardware.power;
    if (device.hardware.disks.length === 0) {
      device.hardware.disks = (defaultDisks ?? []).map((d) => ({ ...d, id: ctx.createId('disk') }));
    }
    if (model.switching) device.switching = clone(model.switching);

    const previousForm = device.formFactor;
    device.formFactor = clone(model.formFactor);
    const placement = device.placement;
    if (
      placement?.u !== undefined &&
      JSON.stringify(previousForm) !== JSON.stringify(model.formFactor)
    ) {
      const fit = checkRackFit(draft, id, placement.locationId, placement.u);
      if (!fit.ok) delete device.placement;
      else if (fit.onShelf !== !!placement.onShelf)
        device.placement = {
          locationId: placement.locationId,
          u: fit.u,
          ...(fit.onShelf ? { onShelf: true } : {}),
        };
    }

    applyPorts(draft, id, model.ports, ctx);
  },
);

/** A physical port to create (catalog model or own template). */
export interface PortSpec {
  name: string;
  kind: Interface['kind'];
  speedMbps?: number | undefined;
  poe?: { role: 'pd' | 'pse'; standard?: 'af' | 'at' | 'bt' | undefined } | undefined;
}

/**
 * Physical ports from a template, matched by position: kept ports keep cables and addresses,
 * extra old ports go only when nothing is connected to them.
 */
export function applyPorts(
  draft: Project,
  id: string,
  ports: readonly PortSpec[],
  ctx: { createId: ModelContext['createId'] },
) {
  const existingPorts = Object.values(draft.interfaces)
    .filter((i) => i.owner.type === 'device' && i.owner.id === id && PHYSICAL.includes(i.kind))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const linked = new Set(Object.values(draft.links).flatMap((l) => [l.a, l.b]));
  ports.forEach((template, index) => {
    const existing = existingPorts[index];
    const fields = {
      name: template.name,
      kind: template.kind,
      index,
      ...(template.speedMbps ? { speedMbps: template.speedMbps } : {}),
      ...(template.poe ? { poe: { ...template.poe } } : {}),
    };
    if (existing) {
      delete existing.speedMbps;
      delete existing.poe;
      Object.assign(existing, fields);
      return;
    }
    const ifaceId = ctx.createId('interface');
    draft.interfaces[ifaceId] = {
      id: ifaceId,
      owner: { type: 'device', id },
      ...fields,
      addresses: [],
      enabled: true,
    };
  });
  for (const extra of existingPorts.slice(ports.length)) {
    if (!linked.has(extra.id)) removeInterface(draft, extra.id);
  }
}

export interface AddAppOptions {
  /** Port mappings per component key; a missing key = the catalog defaults, `[]` = not published. */
  ports?: Record<string, PortMapping[]>;
  /** Volume pool and size per `<component key>/<volume name>`. */
  volumes?: Record<string, { poolId?: string; sizeBytes?: Bytes }>;
  /** Docker network on the host; created as `bridge` when absent. */
  dockerNetworkId?: string;
}

const uniqueName = (taken: Set<string>, name: string) => {
  let candidate = name;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${name}-${n}`;
  taken.add(candidate);
  return candidate;
};

const ZERO = { cpu: 0, memoryBytes: 0, diskBytes: 0 };

/**
 * `app.addFromCatalog` (SW-06, D-07): a container per component (a stack when there are several),
 * an AppInstance per component and the app's dependencies wired to its own components.
 * Enables the Docker runtime on the host when needed.
 */
export const addAppFromCatalog = defineCommand(
  'app.addFromCatalog',
  (
    draft,
    {
      app,
      catalogVersion,
      host,
      options = {},
    }: { app: CatalogApp; catalogVersion: string; host: HostRef; options?: AddAppOptions },
    ctx,
  ): { stackId?: string; workloadIds: string[]; appIds: string[] } => {
    const target =
      host.type === 'device'
        ? getOrThrow(draft.devices, host.id, 'device')
        : getOrThrow(draft.workloads, host.id, 'workload');
    if ('kind' in target && target.kind === 'container')
      throw new CommandError('APP_HOST_IS_CONTAINER', { id: host.id });
    const runtime = target as { docker?: { enabled: true; networkIds: string[] } };
    runtime.docker ??= { enabled: true, networkIds: [] };

    let networkId = options.dockerNetworkId;
    if (networkId) {
      const network = getOrThrow(draft.dockerNetworks, networkId, 'dockerNetwork');
      if (network.host.type !== host.type || network.host.id !== host.id)
        throw new CommandError('NETWORK_ON_OTHER_HOST', { id: networkId });
    } else {
      networkId = Object.values(draft.dockerNetworks).find(
        (n) => n.host.type === host.type && n.host.id === host.id && n.driver === 'bridge',
      )?.id;
    }
    if (!networkId) {
      networkId = ctx.createId('dockerNetwork');
      draft.dockerNetworks[networkId] = {
        id: networkId,
        host: { ...host },
        name: 'bridge',
        driver: 'bridge',
        subnet: '172.17.0.0/16',
      };
      runtime.docker.networkIds.push(networkId);
    }

    const catalogRef = { id: app.id, version: catalogVersion };
    const components = app.deployment.components;
    let stackId: string | undefined;
    if (components.length > 1) {
      stackId = ctx.createId('stack');
      draft.stacks[stackId] = { id: stackId, name: app.name, host: { ...host }, catalogRef };
    }

    const workloadNames = new Set(Object.values(draft.workloads).map((w) => w.name));
    const appNames = new Set(Object.values(draft.apps).map((a) => a.name));
    const workloadIds: string[] = [];
    const appIdByComponent = new Map<string, string>();
    components.forEach((component, index) => {
      const workloadId = ctx.createId('workload');
      const portMappings = options.ports?.[component.key] ?? component.defaultPortMappings ?? [];
      const container: Workload = {
        id: workloadId,
        kind: 'container',
        name: uniqueName(workloadNames, component.name),
        host: { ...host },
        tagIds: [],
        image: component.image,
        tag: component.defaultTag,
        network: { mode: 'docker-network', dockerNetworkId: networkId },
        portMappings: portMappings.map((m) => ({ ...m })),
        volumes: component.volumes.map((v) => {
          const chosen = options.volumes?.[`${component.key}/${v.name}`];
          const sizeBytes = chosen?.sizeBytes ?? v.defaultSizeBytes;
          return {
            name: v.name,
            containerPath: v.containerPath,
            type: 'named' as const,
            ...(chosen?.poolId ? { poolId: chosen.poolId } : {}),
            ...(sizeBytes !== undefined ? { sizeBytes } : {}),
          };
        }),
        catalogRef,
        ...(stackId ? { stackId } : {}),
      };
      draft.workloads[workloadId] = container;
      workloadIds.push(workloadId);

      const appId = ctx.createId('app');
      const main = index === 0;
      const instance: AppInstance = {
        id: appId,
        name: uniqueName(appNames, main ? app.name : `${app.name} ${component.key}`),
        runsOn: { type: 'workload', id: workloadId },
        catalogRef,
        role: component.role,
        tagIds: [],
        listeners: component.listeners.map((l) => ({ ...l })),
        requirements: main
          ? clone(app.requirements)
          : component.requirements
            ? clone(component.requirements)
            : { min: { ...ZERO }, recommended: { ...ZERO } },
        dependencies: main
          ? app.dependencies.map((d) => ({ capability: d.capability, optional: d.optional }))
          : [],
        trafficPatterns: main ? clone(app.trafficPatterns) : [],
        confidence: app.confidence,
      };
      draft.apps[appId] = instance;
      appIdByComponent.set(component.key, appId);
    });

    const mainApp = draft.apps[appIdByComponent.get(components[0]?.key ?? '') ?? ''];
    if (mainApp) {
      for (const dep of mainApp.dependencies) {
        const provider = app.dependencies.find(
          (d) => d.capability === dep.capability,
        )?.providedByComponent;
        const satisfiedBy = provider ? appIdByComponent.get(provider) : undefined;
        if (satisfiedBy) dep.satisfiedBy = satisfiedBy;
      }
    }
    return { ...(stackId ? { stackId } : {}), workloadIds, appIds: [...appIdByComponent.values()] };
  },
);

/** Host ports already published on a host (for conflict hints in D-07). */
export function publishedPorts(project: Project, host: HostRef): PortMapping[] {
  return Object.values(project.workloads).flatMap((w) =>
    w.kind === 'container' && w.host.type === host.type && w.host.id === host.id
      ? w.portMappings
      : [],
  );
}
