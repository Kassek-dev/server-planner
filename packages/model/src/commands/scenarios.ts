import type { FlowScenario } from '../schema/project';
import { CommandError, defineCommand, getOrThrow } from './core';

/** FLW-07 flow scenarios: processes that run at the same time, with how many of each. */

type Item = FlowScenario['items'][number];

export const addFlowScenario = defineCommand(
  'flowScenario.add',
  (draft, { name }: { name: string }, ctx): string => {
    const trimmed = name.trim();
    if (!trimmed) throw new CommandError('NAME_REQUIRED');
    const id = ctx.createId('flowScenario');
    draft.flowScenarios[id] = { id, name: trimmed, items: [] };
    return id;
  },
);

export const renameFlowScenario = defineCommand(
  'flowScenario.rename',
  (draft, { id, name }: { id: string; name: string }) => {
    const scenario = getOrThrow(draft.flowScenarios, id, 'flowScenario');
    if (!name.trim()) throw new CommandError('NAME_REQUIRED');
    scenario.name = name.trim();
  },
);

export const deleteFlowScenario = defineCommand(
  'flowScenario.delete',
  (draft, { id }: { id: string }) => {
    getOrThrow(draft.flowScenarios, id, 'flowScenario');
    delete draft.flowScenarios[id];
  },
);

/** Adds a process; the same process with the same participants only raises the count. */
export const addFlowScenarioItem = defineCommand(
  'flowScenario.addItem',
  (draft, { id, item }: { id: string; item: Item }) => {
    const scenario = getOrThrow(draft.flowScenarios, id, 'flowScenario');
    getOrThrow(draft.apps, item.appId, 'app');
    const same = scenario.items.find(
      (i) =>
        i.appId === item.appId &&
        i.flowId === item.flowId &&
        JSON.stringify(i.bindings) === JSON.stringify(item.bindings),
    );
    if (same) same.count = Math.min(100, same.count + item.count);
    else scenario.items.push({ ...item, count: Math.min(100, Math.max(1, item.count)) });
  },
);

export const setFlowScenarioItemCount = defineCommand(
  'flowScenario.setCount',
  (draft, { id, index, count }: { id: string; index: number; count: number }) => {
    const item = getOrThrow(draft.flowScenarios, id, 'flowScenario').items[index];
    if (!item) throw new CommandError('NOT_FOUND', { entity: 'item', id: String(index) });
    if (!Number.isInteger(count) || count < 1 || count > 100)
      throw new CommandError('SCENARIO_COUNT_INVALID', {});
    item.count = count;
  },
);

export const removeFlowScenarioItem = defineCommand(
  'flowScenario.removeItem',
  (draft, { id, index }: { id: string; index: number }) => {
    const scenario = getOrThrow(draft.flowScenarios, id, 'flowScenario');
    scenario.items.splice(index, 1);
  },
);
