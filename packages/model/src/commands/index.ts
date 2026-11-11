import * as device from './device';
import * as location from './location';
import * as network from './network';
import * as project from './project';
import * as workload from './workload';

export * from './core';
export * from './device';
export * from './location';
export * from './network';
export * from './project';
export * from './workload';

/** All commands by name (`device.add`, `link.connect`, …) — used for history labels and logging. */
export const commands = Object.fromEntries(
  [device, location, network, project, workload]
    .flatMap((module) => Object.values(module))
    .filter(
      (value): value is { name: string; run: (...args: never[]) => unknown } =>
        typeof value === 'object' && value !== null && 'name' in value && 'run' in value,
    )
    .map((command) => [command.name, command]),
);
