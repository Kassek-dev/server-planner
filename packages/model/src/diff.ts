import type { Project } from './schema/project';

/** PRJ-07: what changed between two versions of a project (snapshot diff). Layout is ignored. */

export const DIFF_COLLECTIONS = [
  'devices',
  'locations',
  'links',
  'workloads',
  'apps',
  'vlans',
  'subnets',
  'zones',
  'assertions',
] as const;
export type DiffCollection = (typeof DIFF_COLLECTIONS)[number];

export interface DiffEntry {
  collection: DiffCollection;
  id: string;
  name: string;
  change: 'added' | 'removed' | 'changed';
  /** Changed top-level fields (for `changed`). */
  fields?: string[];
}

type Comparable = Pick<Project, DiffCollection | 'interfaces' | 'settings' | 'name'>;

const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );

function nameOf(project: Comparable, collection: DiffCollection, id: string): string {
  const entity = project[collection][id] as Record<string, unknown> | undefined;
  if (!entity) return id;
  if (collection === 'links') {
    const link = project.links[id];
    const end = (i: string | undefined) => {
      const iface = i ? project.interfaces[i] : undefined;
      const owner =
        iface?.owner.type === 'device' ? project.devices[iface.owner.id]?.name : undefined;
      return `${owner ?? '?'}:${iface?.name ?? '?'}`;
    };
    return `${end(link?.a)} ↔ ${end(link?.b)}`;
  }
  if (collection === 'vlans') return `VLAN ${entity.vid as number}`;
  if (collection === 'subnets') return entity.cidr as string;
  return (entity.name as string | undefined) ?? id;
}

/** Interfaces belong to their owner: a changed port shows as a change of its device or workload. */
function ownerFields(project: Comparable): Map<string, string> {
  const out = new Map<string, string>();
  const byOwner = new Map<string, unknown[]>();
  for (const iface of Object.values(project.interfaces)) {
    const list = byOwner.get(iface.owner.id) ?? [];
    list.push(iface);
    byOwner.set(iface.owner.id, list);
  }
  for (const [owner, list] of byOwner) out.set(owner, stable(list));
  return out;
}

export function diffProjects(before: Comparable, after: Comparable): DiffEntry[] {
  const out: DiffEntry[] = [];
  const portsBefore = ownerFields(before);
  const portsAfter = ownerFields(after);
  for (const collection of DIFF_COLLECTIONS) {
    const a = before[collection] as Record<string, Record<string, unknown>>;
    const b = after[collection] as Record<string, Record<string, unknown>>;
    for (const id of Object.keys(b))
      if (!a[id])
        out.push({ collection, id, name: nameOf(after, collection, id), change: 'added' });
    for (const id of Object.keys(a))
      if (!b[id])
        out.push({ collection, id, name: nameOf(before, collection, id), change: 'removed' });
    for (const id of Object.keys(b)) {
      const x = a[id];
      const y = b[id];
      if (!x || !y) continue;
      const fields = [...new Set([...Object.keys(x), ...Object.keys(y)])]
        .filter((k) => stable(x[k]) !== stable(y[k]))
        .sort();
      if (
        (collection === 'devices' || collection === 'workloads') &&
        portsBefore.get(id) !== portsAfter.get(id)
      )
        fields.push('interfaces');
      if (fields.length > 0)
        out.push({
          collection,
          id,
          name: nameOf(after, collection, id),
          change: 'changed',
          fields,
        });
    }
  }
  return out;
}
