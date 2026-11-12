import { updateProject } from '@server-planner/model';
import { Download, Play, Redo2, Undo2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';
import { NotFoundPage } from '../../app/routes/NotFoundPage';
import { useServices, useSession } from '../../app/services';
import { TopBar } from '../../app/shell/TopBar';
import { engineOptions, useCatalog } from '../../catalog/store';
import { connectResults } from '../../store/results';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { Led, type LedStatus } from '../../ui/Led';
import { CanvasWorkspace } from '../canvas/CanvasView';
import { useSelection } from '../canvas/selection';
import { DrawerHost } from '../drawers/DrawerHost';
import { useExportDialog } from '../export/store';
import { SelectionPanel } from '../inspector/SelectionPanel';
import { IssueCounters } from '../issues/IssueCounters';
import { describeCommit } from '../toasts/describe';
import { useToasts } from '../toasts/store';
import { Toaster } from '../toasts/Toaster';

type LoadState = 'loading' | 'ready' | 'missing';

/** V-01 shell (docs/05 § 3) for MVP stage 2: load, rename, save state, undo/redo, export. */
export function EditorPage() {
  const { projectId = '' } = useParams();
  const { repository, session, analyzer } = useServices();
  const [load, setLoad] = useState<LoadState>('loading');

  // Engines follow the open project (docs/03 § 5.5) and take OS overhead from the catalog.
  const catalog = useCatalog((s) => s.catalog);
  useEffect(() => {
    void useCatalog.getState().load();
  }, []);
  // Toasts with Undo for deletions, the automatic Internet node and catalog apps (O-12).
  useEffect(
    () =>
      session.onCommit((entry, before) => {
        const after = session.getState().project;
        const toast = after ? describeCommit(entry, before, after) : null;
        if (toast) useToasts.getState().push(toast);
      }),
    [session],
  );
  useEffect(() => {
    if (!catalog) return;
    const options = engineOptions(catalog);
    return connectResults(session, (project) => analyzer(project, options));
  }, [session, analyzer, catalog]);

  useEffect(() => {
    let cancelled = false;
    setLoad('loading');
    void repository.get(projectId).then((project) => {
      if (cancelled) return;
      if (!project) {
        setLoad('missing');
        return;
      }
      session.load(project);
      setLoad('ready');
    });
    return () => {
      cancelled = true;
      useSelection.getState().clear();
      void session.clear();
    };
  }, [projectId, repository, session]);

  if (load === 'missing') return <NotFoundPage project />;
  return load === 'ready' ? <Editor /> : <EditorLoading />;
}

function EditorLoading() {
  const { t } = useTranslation('editor');
  return (
    <div
      className="flex h-full items-center justify-center bg-app text-text-secondary"
      role="status"
    >
      {t('loading')}
    </div>
  );
}

function Editor() {
  const { t } = useTranslation('editor');
  const { session } = useServices();
  const project = useSession((s) => s.project);
  const canUndo = useSession((s) => s.past.length > 0);
  const canRedo = useSession((s) => s.future.length > 0);
  const saveState = useSession((s) => s.saveState);

  // `?sel=` mirrors the selection so links reopen the same view (docs/07 § 0).
  const [params, setParams] = useSearchParams();
  // Read once on mount; afterwards the selection drives the URL.
  // biome-ignore lint/correctness/useExhaustiveDependencies: initial read only
  useEffect(() => {
    const ids = (params.get('sel') ?? '').split(',').filter(Boolean);
    const current = session.getState().project;
    if (!current) return;
    useSelection.getState().set(
      ids.filter((id) => current.devices[id] || current.locations[id]),
      ids.filter((id) => current.links[id]),
    );
  }, []);
  const selected = useSelection((s) => [...s.nodeIds, ...s.edgeIds].join(','));
  useEffect(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (selected) next.set('sel', selected);
        else next.delete('sel');
        return next;
      },
      { replace: true },
    );
  }, [selected, setParams]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const mod = event.ctrlKey || event.metaKey;
      // `S` opens / closes the simulation panel (docs/07 X-01).
      if (!mod && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        setParams((prev) => {
          const next = new URLSearchParams(prev);
          if (next.get('panel') === 'sim') next.delete('panel');
          else next.set('panel', 'sim');
          return next;
        });
        return;
      }
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        session.undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        session.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, setParams]);

  if (!project) return null;

  return (
    <div className="flex h-full flex-col bg-app text-text-primary">
      <TopBar nav={false}>
        <ProjectName name={project.name} />
        <SaveIndicator state={saveState} />
        <nav
          aria-label={t('views.label')}
          className="ml-4 flex rounded-md border border-border-subtle"
        >
          <span aria-current="page" className="bg-tile-header px-3 py-1.5 font-medium">
            {t('views.topology')}
          </span>
        </nav>
        <div className="grow" />
        <IssueCounters />
        <div className="flex items-center gap-1">
          <IconButton label={t('undo')} disabled={!canUndo} onClick={() => session.undo()}>
            <Undo2 size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label={t('redo')} disabled={!canRedo} onClick={() => session.redo()}>
            <Redo2 size={16} aria-hidden="true" />
          </IconButton>
        </div>
        <Button
          icon={<Download size={14} aria-hidden="true" />}
          onClick={() => useExportDialog.getState().setOpen(true)}
        >
          {t('export')}
        </Button>
        <Button
          variant="primary"
          icon={<Play size={14} aria-hidden="true" />}
          aria-pressed={params.get('panel') === 'sim'}
          aria-keyshortcuts="S"
          onClick={() =>
            setParams((prev) => {
              const next = new URLSearchParams(prev);
              if (next.get('panel') === 'sim') next.delete('panel');
              else next.set('panel', 'sim');
              return next;
            })
          }
        >
          {t('simulate')}
        </Button>
      </TopBar>
      {saveState === 'error' ? (
        <div className="border-b border-error-border">
          <Banner kind="error">{t('save.error')}</Banner>
        </div>
      ) : null}
      <main className="flex min-h-0 flex-1">
        <CanvasWorkspace />
        <SelectionPanel />
      </main>
      <DrawerHost />
      <Toaster />
    </div>
  );
}

function ProjectName({ name }: { name: string }) {
  const { t } = useTranslation('editor');
  const { session } = useServices();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  const commit = (event?: FormEvent) => {
    event?.preventDefault();
    setEditing(false);
    const next = value.trim();
    if (next && next !== name) session.dispatch(updateProject, { changes: { name: next } });
    else setValue(name);
  };

  if (editing) {
    return (
      <form onSubmit={commit}>
        <input
          aria-label={t('rename')}
          value={value}
          // biome-ignore lint/a11y/noAutofocus: inline rename starts typing immediately (O-14)
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setValue(name);
              setEditing(false);
            }
          }}
          className="h-7 rounded-md border border-accent bg-inset px-2 font-mono text-data text-text-primary outline-none"
        />
      </form>
    );
  }
  return (
    <button
      type="button"
      title={t('rename')}
      onClick={() => {
        setValue(name);
        setEditing(true);
      }}
      className="rounded-md border border-border-subtle px-2 py-0.75 font-mono text-data text-text-secondary hover:text-text-primary"
    >
      {name}
    </button>
  );
}

const saveLed: Record<string, LedStatus> = {
  saved: 'ok',
  pending: 'off',
  saving: 'info',
  error: 'error',
};

function SaveIndicator({ state }: { state: 'saved' | 'pending' | 'saving' | 'error' }) {
  const { t } = useTranslation('editor');
  return (
    <span
      className="flex items-center gap-1.5 text-body-sm text-text-muted"
      role="status"
      aria-live="polite"
    >
      <Led status={saveLed[state] ?? 'off'} size={7} />
      {t(`save.${state}`)}
    </span>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-md text-text-primary hover:bg-tile-header disabled:opacity-45"
    >
      {children}
    </button>
  );
}
