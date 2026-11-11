import type { EntityRef } from '@server-planner/engine';
import type { Project } from '@server-planner/model';
import { useSelection } from '../canvas/selection';
import { useDrawer } from '../drawers/useDrawer';

/** Opens the element an issue points at: canvas selection, inspector detail or the right drawer. */
export function useRevealTarget(project: Project | null) {
  const { open } = useDrawer();
  return (target: EntityRef | undefined) => {
    if (!project || !target) return;
    const sel = useSelection.getState();
    switch (target.type) {
      case 'device':
      case 'location':
        sel.set([target.id]);
        return;
      case 'link':
        sel.set([], [target.id]);
        return;
      case 'interface': {
        const iface = project.interfaces[target.id];
        if (iface?.owner.type === 'device') sel.set([iface.owner.id]);
        else if (iface) sel.setDetail({ type: 'workload', id: iface.owner.id });
        return;
      }
      case 'workload':
      case 'app':
        sel.setDetail({ type: target.type, id: target.id });
        return;
      case 'vlan':
      case 'subnet':
      case 'zone':
        open({ kind: 'vlans' });
        return;
      case 'rule': {
        const router = Object.values(project.devices).find((d) =>
          d.firewall?.rules.some((r) => r.id === target.id),
        );
        if (router) open({ kind: 'firewall', deviceId: router.id });
        return;
      }
      default:
        return;
    }
  };
}

/** Human label of a target for the issue row link. */
export function targetLabel(project: Project, target: EntityRef): string {
  switch (target.type) {
    case 'device':
      return project.devices[target.id]?.name ?? '?';
    case 'location':
      return project.locations[target.id]?.name ?? '?';
    case 'workload':
      return project.workloads[target.id]?.name ?? '?';
    case 'app':
      return project.apps[target.id]?.name ?? '?';
    case 'subnet':
      return project.subnets[target.id]?.cidr ?? '?';
    case 'vlan': {
      const v = project.vlans[target.id];
      return v ? `VLAN ${v.vid}` : '?';
    }
    case 'interface': {
      const i = project.interfaces[target.id];
      const owner = i
        ? (project.devices[i.owner.id]?.name ?? project.workloads[i.owner.id]?.name)
        : undefined;
      return i ? `${owner ?? '?'}:${i.name}` : '?';
    }
    case 'link':
      return 'link';
    default:
      return target.type;
  }
}
