import { updateProject } from '@server-planner/model';
import { Download, Play, Redo2, Undo2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { NotFoundPage } from '../../app/routes/NotFoundPage';
import { useServices, useSession } from '../../app/services';
import { TopBar } from '../../app/shell/TopBar';
import { useIsMobile } from '../../app/useIsMobile';
import { engineOptions, useCatalog } from '../../catalog/store';
import { connectResults } from '../../store/results';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { Led, type LedStatus } from '../../ui/Led';
import { Select } from '../../ui/Select';
import { AccessView } from '../access/AccessView';
import { CanvasWorkspace } from '../canvas/CanvasView';
import { useSelection } from '../canvas/selection';
import { DashboardView } from '../dashboard/DashboardView';
import { DrawerHost } from '../drawers/DrawerHost';
import { ExportDialog } from '../export/ExportDialog';
import { useExportDialog } from '../export/store';
import { SelectionPanel } from '../inspector/SelectionPanel';
import { InventoryView } from '../inventory/InventoryView';
import { IpPlanView } from '../ipplan/IpPlanView';
import { IssueCounters } from '../issues/IssueCounters';
import { SnapshotsView } from '../snapshots/SnapshotsView';
import { describeCommit } from '../toasts/describe';
import { useToasts } from '../toasts/store';
import { Toaster } from '../toasts/Toaster';
import { CommandPalette } from './CommandPalette';
import { useOtherTabs } from './otherTabs';

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

type View = 'topology' | 'dashboard' | 'inventory' | 'ip' | 'access' | 'snapshots';
const VIEWS: { id: View; path: string }[] = [
  { id: 'topology', path: '' },
  { id: 'dashboard', path: 'dashboard' },
  { id: 'inventory', path: 'inventory' },
  { id: 'ip', path: 'ip' },
  { id: 'access', path: 'access' },
];

function useView(): View {
  const rest = useParams()['*'] ?? '';
  // Snapshots (V-06) open from the project summary and the palette, not from the tabs.
  if (rest.startsWith('snapshots')) return 'snapshots';
  return VIEWS.find((v) => v.path && rest.startsWith(v.path))?.id ?? 'topology';
}

/** Topology | Dashboard | Inventory | IP Plan | Access (docs/05 § 3); the selection and `?panel` survive the switch. */
function ViewTabs() {
  const { t } = useTranslation('editor');
  const { projectId = '' } = useParams();
  const view = useView();
  const [params] = useSearchParams();
  const search = params.toString();
  return (
    <nav aria-label={t('views.label')} className="ml-4 flex rounded-md border border-border-subtle">
      {VIEWS.map((v) => (
        <Link
          key={v.id}
          to={{
            pathname: `/p/${projectId}${v.path ? `/${v.path}` : ''}`,
            search: search ? `?${search}` : '',
          }}
          aria-current={v.id === view ? 'page' : undefined}
          className={`px-3 py-1.5 no-underline ${v.id === view ? 'bg-tile-header font-medium text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
        >
          {t(`views.${v.id}`)}
        </Link>
      ))}
    </nav>
  );
}

/** Views as a select on phones, where the tab strip does not fit (docs/05 § 12). */
function ViewSelect() {
  const { t } = useTranslation('editor');
  const { projectId = '' } = useParams();
  const view = useView();
  const navigate = useNavigate();
  return (
    <div className="w-32">
      <Select
        label={t('views.label')}
        hideLabel
        value={view}
        onChange={(e) => {
          const next = VIEWS.find((v) => v.id === e.target.value);
          navigate(`/p/${projectId}${next?.path ? `/${next.path}` : ''}`);
        }}
        options={VIEWS.map((v) => ({ value: v.id, label: t(`views.${v.id}`) }))}
      />
    </div>
  );
}

const MOBILE_NOTICE_KEY = 'server-planner:mobile-notice';

/** One-time banner on phones: the editor is view-only there. */
function MobileNotice() {
  const { t } = useTranslation('editor');
  const [shown, setShown] = useState(() => {
    try {
      return localStorage.getItem(MOBILE_NOTICE_KEY) !== 'dismissed';
    } catch {
      return true;
    }
  });
  if (!shown) return null;
  return (
    <div className="flex items-center gap-2 border-b border-info-border bg-info-bg pr-2">
      <div className="flex-1">
        <Banner kind="info">{t('mobile.notice')}</Banner>
      </div>
      <Button
        size="touch"
        variant="ghost"
        onClick={() => {
          try {
            localStorage.setItem(MOBILE_NOTICE_KEY, 'dismissed');
          } catch {
            // Private mode: the banner simply comes back next time.
          }
          setShown(false);
        }}
      >
        {t('mobile.dismiss')}
      </Button>
    </div>
  );
}

function Editor() {
  const { t } = useTranslation('editor');
  const view = useView();
  const { session } = useServices();
  const project = useSession((s) => s.project);
  const canUndo = useSession((s) => s.past.length > 0);
  const canRedo = useSession((s) => s.future.length > 0);
  const saveState = useSession((s) => s.saveState);
  const otherTab = useOtherTabs(project?.id ?? '');
  const mobile = useIsMobile();
  useEffect(() => session.setReadOnly(mobile), [mobile, session]);

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
        {mobile ? <ViewSelect /> : <SaveIndicator state={saveState} />}
        {mobile ? null : <ViewTabs />}
        <div className="grow" />
        <IssueCounters />
        <div className={`flex items-center gap-1 ${mobile ? 'hidden' : ''}`}>
          <IconButton label={t('undo')} disabled={!canUndo} onClick={() => session.undo()}>
            <Undo2 size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label={t('redo')} disabled={!canRedo} onClick={() => session.redo()}>
            <Redo2 size={16} aria-hidden="true" />
          </IconButton>
        </div>
        {mobile ? null : (
          <Button
            icon={<Download size={14} aria-hidden="true" />}
            onClick={() => useExportDialog.getState().setOpen(true)}
          >
            {t('export')}
          </Button>
        )}
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
          <span className={mobile ? 'sr-only' : undefined}>{t('simulate')}</span>
        </Button>
      </TopBar>
      {mobile ? <MobileNotice /> : null}
      {otherTab ? (
        <div className="border-b border-warning-border">
          <Banner kind="warning">{t('otherTab')}</Banner>
        </div>
      ) : null}
      {saveState === 'error' ? (
        <div className="border-b border-error-border">
          <Banner kind="error">{t('save.error')}</Banner>
        </div>
      ) : null}
      <main className="flex min-h-0 flex-1">
        {view === 'snapshots' ? (
          <SnapshotsView />
        ) : view === 'dashboard' ? (
          <DashboardView />
        ) : view === 'inventory' ? (
          <InventoryView />
        ) : view === 'ip' ? (
          <IpPlanView />
        ) : view === 'access' ? (
          <AccessView />
        ) : (
          <CanvasWorkspace />
        )}
        <SelectionPanel />
      </main>
      <DrawerHost />
      <ExportDialog />
      <CommandPalette project={project} />
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
