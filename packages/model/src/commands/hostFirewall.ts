import type { HostFirewallRule } from '../schema/network';
import type { Project } from '../schema/project';
import { CommandError, defineCommand, getOrThrow } from './core';

/** NET-15 host firewall on a device or a VM/LXC (containers use their host's). */

export type HostFirewallOwner = { type: 'device' | 'workload'; id: string };

function ownerOf(draft: Project, owner: HostFirewallOwner) {
  if (owner.type === 'device') return getOrThrow(draft.devices, owner.id, 'device');
  const workload = getOrThrow(draft.workloads, owner.id, 'workload');
  if (workload.kind === 'container')
    throw new CommandError('HOST_FIREWALL_CONTAINER', { name: workload.name });
  return workload;
}

/** Turns the firewall on (deny inbound by default, like ufw) or off, or changes its default. */
export const setHostFirewall = defineCommand(
  'hostFirewall.set',
  (
    draft,
    {
      owner,
      enabled,
      inbound,
      outbound,
    }: {
      owner: HostFirewallOwner;
      enabled?: boolean;
      inbound?: 'allow' | 'deny';
      outbound?: 'allow' | 'deny';
    },
  ) => {
    const entity = ownerOf(draft, owner);
    const fw = entity.hostFirewall ?? { enabled: false, inbound: 'deny' as const, rules: [] };
    entity.hostFirewall = {
      ...fw,
      ...(enabled !== undefined ? { enabled } : {}),
      ...(inbound !== undefined ? { inbound } : {}),
      ...(outbound !== undefined ? { outbound } : {}),
    };
  },
);

export const addHostFirewallRule = defineCommand(
  'hostFirewall.addRule',
  (
    draft,
    { owner, rule }: { owner: HostFirewallOwner; rule: Omit<HostFirewallRule, 'id'> },
    ctx,
  ): string => {
    const entity = ownerOf(draft, owner);
    entity.hostFirewall ??= { enabled: true, inbound: 'deny', rules: [] };
    const id = ctx.createId('hostFirewallRule');
    entity.hostFirewall.rules.push({ ...rule, id });
    return id;
  },
);

export const updateHostFirewallRule = defineCommand(
  'hostFirewall.updateRule',
  (
    draft,
    {
      owner,
      id,
      changes,
    }: { owner: HostFirewallOwner; id: string; changes: Partial<Omit<HostFirewallRule, 'id'>> },
  ) => {
    const rules = ownerOf(draft, owner).hostFirewall?.rules ?? [];
    const index = rules.findIndex((r) => r.id === id);
    const rule = rules[index];
    if (!rule) throw new CommandError('NOT_FOUND', { entity: 'rule', id });
    const next = { ...rule, ...changes };
    for (const key of Object.keys(changes) as (keyof typeof changes)[])
      if (changes[key] === undefined) delete next[key];
    rules[index] = next;
  },
);

export const deleteHostFirewallRule = defineCommand(
  'hostFirewall.deleteRule',
  (draft, { owner, id }: { owner: HostFirewallOwner; id: string }) => {
    const fw = ownerOf(draft, owner).hostFirewall;
    if (fw) fw.rules = fw.rules.filter((r) => r.id !== id);
  },
);

/** Moves a rule up or down (first match wins). */
export const moveHostFirewallRule = defineCommand(
  'hostFirewall.moveRule',
  (draft, { owner, id, by }: { owner: HostFirewallOwner; id: string; by: -1 | 1 }) => {
    const rules = ownerOf(draft, owner).hostFirewall?.rules ?? [];
    const from = rules.findIndex((r) => r.id === id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= rules.length) return;
    const [rule] = rules.splice(from, 1);
    if (rule) rules.splice(to, 0, rule);
  },
);
