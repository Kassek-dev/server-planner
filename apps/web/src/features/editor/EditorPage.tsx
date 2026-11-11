import { type Project, updateProject } from '@server-planner/model';
import { Download, Redo2, Undo2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { downloadBlob } from '../../app/download';
import { NotFoundPage } from '../../app/routes/NotFoundPage';
import { useServices, useSession } from '../../app/services';
import { TopBar } from '../../app/shell/TopBar';
import { exportBlob, exportFileName } from '../../persistence/backup';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { Led, type LedStatus } from '../../ui/Led';

type LoadState = 'loading' | 'ready' | 'missing';

/** V-01 shell (docs/05 § 3) for MVP stage 2: load, rename, save state, undo/redo, export. */
export function EditorPage() {
  const { projectId = '' } = useParams();
  const { repository, session } = useServices();
  const [load, setLoad] = useState<LoadState>('loading');

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
  const { session, repository } = useServices();
  const project = useSession((s) => s.project);
  const canUndo = useSession((s) => s.past.length > 0);
  const canRedo = useSession((s) => s.future.length > 0);
  const saveState = useSession((s) => s.saveState);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      const mod = event.ctrlKey || event.metaKey;
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
  }, [session]);

  if (!project) return null;

  const exportJson = async () => {
    await session.flush();
    const current = session.getState().project;
    if (!current) return;
    downloadBlob(exportBlob(current), exportFileName(current));
    await repository.recordExport();
  };

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
        <div className="flex items-center gap-1">
          <IconButton label={t('undo')} disabled={!canUndo} onClick={() => session.undo()}>
            <Undo2 size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label={t('redo')} disabled={!canRedo} onClick={() => session.redo()}>
            <Redo2 size={16} aria-hidden="true" />
          </IconButton>
        </div>
        <Button icon={<Download size={14} aria-hidden="true" />} onClick={() => void exportJson()}>
          {t('export')}
        </Button>
      </TopBar>
      <main className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-8">
        {saveState === 'error' ? (
          <div className="w-full max-w-130">
            <Banner kind="error">{t('save.error')}</Banner>
          </div>
        ) : null}
        <Summary project={project} />
      </main>
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

function Summary({ project }: { project: Project }) {
  const { t } = useTranslation('editor');
  const rows: [string, number][] = [
    [
      t('summary.devices'),
      Object.values(project.devices).filter((d) => d.kind !== 'internet').length,
    ],
    [t('summary.locations'), Object.keys(project.locations).length],
    [t('summary.vlans'), Object.keys(project.vlans).length],
    [t('summary.workloads'), Object.keys(project.workloads).length],
    [t('summary.apps'), Object.keys(project.apps).length],
  ];
  return (
    <section className="flex w-full max-w-130 flex-col gap-3 rounded-md border border-border-default bg-panel p-5">
      <h1 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
        {t('summary.title')}
      </h1>
      <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd className="m-0 text-right font-mono text-data text-text-secondary">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 text-body-sm text-text-muted">{t('summary.canvasLater')}</p>
    </section>
  );
}
