import type { Project } from '@server-planner/model';
import type { HistoryEntry } from '../../store/projectSession';
import type { Toast } from './store';

/** Collections whose removal names the deleted element in the toast. */
const NAMED: Partial<
  Record<keyof Project, (value: Record<string, unknown>) => string | undefined>
> = {
  devices: (v) => v.name as string,
  locations: (v) => v.name as string,
  workloads: (v) => v.name as string,
  apps: (v) => v.name as string,
  stacks: (v) => v.name as string,
  vlans: (v) => `VLAN ${v.vid as number}`,
  subnets: (v) => v.cidr as string,
  zones: (v) => v.name as string,
  tags: (v) => v.name as string,
  assertions: (v) => v.name as string | undefined,
};

/** Top-level entities (collection, id) added by the given patches. */
function touched(patches: HistoryEntry['patches'], op: 'add' | 'remove') {
  return patches
    .filter((p) => p.op === op && p.path.length === 2)
    .map((p) => ({ collection: String(p.path[0]) as keyof Project, id: String(p.path[1]) }));
}

/**
 * Which commits get a toast (docs/05 § 15): deletions (UI3), the automatic Internet node (UI2)
 * and apps added from the catalog (§ 6.3). Everything else is silent.
 */
export function describeCommit(
  entry: HistoryEntry,
  before: Project,
  after: Project,
): Omit<Toast, 'id'> | null {
  const { label } = entry;
  if (label === 'canvas.addInternet') {
    const router = touched(entry.patches, 'add')
      .filter((t) => t.collection === 'links')
      .map((t) => after.links[t.id])
      .flatMap((link) => link && [link.a, link.b].map((i) => after.interfaces[i]?.owner.id))
      .map((id) => (id ? after.devices[id] : undefined))
      .find((d) => d && d.kind !== 'internet');
    return {
      message: { key: 'internetAdded', params: { router: router?.name ?? '' } },
      undo: entry,
    };
  }
  if (label.startsWith('app.addFromCatalog')) {
    const apps = touched(entry.patches, 'add').filter((t) => t.collection === 'apps');
    const containers = touched(entry.patches, 'add').filter((t) => t.collection === 'workloads');
    const first = apps[0] ? after.apps[apps[0].id] : undefined;
    const isMany = label.endsWith('.many');
    return {
      message: isMany
        ? { key: 'appsAdded', params: { count: containers.length } }
        : { key: 'appAdded', params: { name: first?.name ?? '', count: containers.length } },
      undo: entry,
    };
  }
  if (!/delete|remove/i.test(label)) return null;
  const names = touched(entry.patches, 'remove')
    .map((t) => {
      const named = NAMED[t.collection];
      const value = (before[t.collection] as Record<string, Record<string, unknown>> | undefined)?.[
        t.id
      ];
      return named && value ? named(value) : undefined;
    })
    .filter((n): n is string => !!n);
  return {
    message:
      names.length === 0
        ? { key: 'deletedGeneric' }
        : names.length <= 2
          ? { key: 'deleted', params: { names: names.join(', ') } }
          : { key: 'deletedMany', params: { first: names[0] ?? '', count: names.length - 1 } },
    undo: entry,
  };
}
