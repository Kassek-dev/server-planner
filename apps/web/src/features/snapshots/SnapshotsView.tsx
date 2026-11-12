import {
  DIFF_COLLECTIONS,
  type DiffEntry,
  diffProjects,
  type Project,
  restoreSnapshot,
} from '@server-planner/model';
import { Camera, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices, useSession } from '../../app/services';
import type { StoredSnapshot } from '../../persistence/db';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Select } from '../../ui/Select';
import { TextField } from '../../ui/TextField';
import { useSelection } from '../canvas/selection';

const CURRENT = 'current';

/** V-06 Snapshots (PRJ-07): named versions of the project and the diff between two of them. */
export function SnapshotsView() {
  const { t } = useTranslation('views');
  const { repository, session } = useServices();
  const project = useSession((s) => s.project);
  const [snapshots, setSnapshots] = useState<StoredSnapshot[] | null>(null);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>(CURRENT);
  const [creating, setCreating] = useState(false);
  const projectId = project?.id ?? '';

  const reload = useCallback(async () => {
    const list = await repository.listSnapshots(projectId);
    setSnapshots(list);
    return list;
  }, [repository, projectId]);
  useEffect(() => {
    if (projectId) void reload().then((list) => setFrom((f) => (f || list[0]?.id) ?? ''));
  }, [projectId, reload]);

  const version = (id: string): (Pick<Project, 'name'> & Omit<Project, 'id'>) | undefined =>
    id === CURRENT ? (project ?? undefined) : snapshots?.find((s) => s.id === id)?.project;
  const a = version(from);
  const b = version(to);
  const diff = useMemo(() => (a && b ? diffProjects(a, b) : []), [a, b]);

  if (!project) return null;
  const options = [
    { value: CURRENT, label: t('snapshots.current') },
    ...(snapshots ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];
  const selected = snapshots?.find((s) => s.id === from);

  const create = async (name: string) => {
    await session.flush();
    const snapshot = await repository.createSnapshot(project, name);
    await reload();
    setFrom(snapshot.id);
    setTo(CURRENT);
    setCreating(false);
  };
  const restore = async (snapshot: StoredSnapshot) => {
    // Keep the current state as a snapshot too, so a restore never loses work.
    await repository.createSnapshot(project, t('snapshots.beforeRestore', { name: snapshot.name }));
    session.dispatch(restoreSnapshot, { snapshot });
    await reload();
  };
  const remove = async (snapshot: StoredSnapshot) => {
    await repository.deleteSnapshot(snapshot.id);
    const list = await reload();
    if (from === snapshot.id) setFrom(list[0]?.id ?? '');
    if (to === snapshot.id) setTo(CURRENT);
  };

  return (
    <section aria-label={t('snapshots.title')} className="flex min-w-0 flex-1 flex-col bg-app">
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
        <h2 className="m-0 text-title font-semibold">{t('snapshots.title')}</h2>
        <span className="grow" />
        <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
          <Camera size={14} aria-hidden="true" />
          {t('snapshots.create')}
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label={t('snapshots.list')}
          className="flex w-72 shrink-0 flex-col gap-1 overflow-auto border-r border-border-subtle p-3"
        >
          {snapshots?.length === 0 ? (
            <p className="m-0 text-body-sm text-text-secondary">{t('snapshots.empty')}</p>
          ) : null}
          {(snapshots ?? []).map((s) => (
            <div
              key={s.id}
              className={`flex items-center gap-1 rounded-md px-2 py-1.5 ${from === s.id ? 'bg-accent-subtle' : 'hover:bg-tile-header'}`}
            >
              <button
                type="button"
                aria-current={from === s.id ? 'true' : undefined}
                onClick={() => setFrom(s.id)}
                className="flex min-w-0 flex-1 flex-col text-left"
              >
                <span className="truncate font-medium">{s.name}</span>
                <span className="font-mono text-data-sm text-text-muted">
                  {new Date(s.createdAt).toLocaleString('en', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('snapshots.delete', { name: s.name })}
                onClick={() => void remove(s)}
              >
                <Trash2 size={14} aria-hidden="true" />
              </Button>
            </div>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-auto p-4">
          {selected ? (
            <div className="flex max-w-200 flex-col gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-56">
                  <Select
                    label={t('snapshots.from')}
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    options={options}
                  />
                </div>
                <div className="w-56">
                  <Select
                    label={t('snapshots.to')}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    options={options}
                  />
                </div>
                <span className="grow" />
                <Button onClick={() => void restore(selected)}>
                  <RotateCcw size={14} aria-hidden="true" />
                  {t('snapshots.restore', { name: selected.name })}
                </Button>
              </div>
              <DiffList diff={diff} />
            </div>
          ) : (
            <p className="m-0 text-text-secondary">{t('snapshots.pick')}</p>
          )}
        </div>
      </div>
      <CreateSnapshotDialog
        open={creating}
        onOpenChange={setCreating}
        onCreate={(name) => void create(name)}
      />
    </section>
  );
}

const MARK: Record<DiffEntry['change'], { sign: string; className: string }> = {
  added: { sign: '+', className: 'text-ok-text' },
  removed: { sign: '−', className: 'text-error-text' },
  changed: { sign: '~', className: 'text-warning-text' },
};

function DiffList({ diff }: { diff: DiffEntry[] }) {
  const { t } = useTranslation('views');
  const reveal = (entry: DiffEntry) => {
    if (entry.change === 'removed') return;
    if (entry.collection === 'devices' || entry.collection === 'locations')
      useSelection.getState().set([entry.id]);
    else if (entry.collection === 'workloads' || entry.collection === 'apps')
      useSelection.getState().setDetail({
        type: entry.collection === 'apps' ? 'app' : 'workload',
        id: entry.id,
      });
  };
  if (diff.length === 0) return <p className="m-0 text-text-secondary">{t('snapshots.same')}</p>;
  const counts = (change: DiffEntry['change']) => diff.filter((d) => d.change === change).length;
  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <span className="font-mono text-data-sm text-text-secondary">
        {t('snapshots.summary', {
          added: counts('added'),
          removed: counts('removed'),
          changed: counts('changed'),
        })}
      </span>
      {DIFF_COLLECTIONS.filter((c) => diff.some((d) => d.collection === c)).map((collection) => (
        <section key={collection} className="flex flex-col gap-1">
          <h3 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
            {t(`snapshots.collections.${collection}`)}
          </h3>
          <ul className="m-0 flex list-none flex-col rounded-md border border-border-subtle bg-panel p-0">
            {diff
              .filter((d) => d.collection === collection)
              .map((d) => (
                <li
                  key={`${d.change}:${d.id}`}
                  className="flex items-center gap-3 border-b border-border-subtle px-3 py-1.5 last:border-b-0"
                >
                  <span
                    role="img"
                    aria-label={t(`snapshots.change.${d.change}`)}
                    className={`w-4 font-mono font-semibold ${MARK[d.change].className}`}
                  >
                    {MARK[d.change].sign}
                  </span>
                  {d.change === 'removed' ? (
                    <span className="flex-1 text-text-secondary line-through">{d.name}</span>
                  ) : (
                    <button
                      type="button"
                      className="flex-1 text-left hover:underline"
                      onClick={() => reveal(d)}
                    >
                      {d.name}
                    </button>
                  )}
                  {d.fields ? (
                    <span className="font-mono text-data-sm text-text-muted">
                      {d.fields.join(', ')}
                    </span>
                  ) : null}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** D-12 Create snapshot: a name for the current state. */
function CreateSnapshotDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => void;
}) {
  const { t } = useTranslation('views');
  const [name, setName] = useState('');
  useEffect(() => {
    if (open)
      setName(
        t('snapshots.defaultName', {
          date: new Date().toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }),
        }),
      );
  }, [open, t]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('snapshots.dialogTitle')}
      description={t('snapshots.dialogDescription')}
      closeLabel={t('snapshots.cancel')}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('snapshots.cancel')}</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => onCreate(name.trim())}>
            {t('snapshots.save')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreate(name.trim());
        }}
      >
        <TextField
          label={t('snapshots.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </form>
    </Dialog>
  );
}
