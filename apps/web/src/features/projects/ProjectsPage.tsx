import { createProject, type Project } from '@server-planner/model';
import { MoreHorizontal, Plus } from 'lucide-react';
import { type DragEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { downloadBlob } from '../../app/download';
import { formatKb, formatRelative } from '../../app/format';
import { useServices } from '../../app/services';
import { Page } from '../../app/shell/Page';
import {
  exportBlob,
  exportFileName,
  ImportError,
  type ImportResult,
  needsBackupReminder,
  prepareImport,
} from '../../persistence/backup';
import type { ProjectMeta } from '../../persistence/db';
import { requestPersistence } from '../../persistence/storage';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { Menu } from '../../ui/Menu';
import { DeleteDialog } from './dialogs/DeleteDialog';
import { ImportResultDialog } from './dialogs/ImportResultDialog';
import { NewProjectDialog, type NewProjectStart } from './dialogs/NewProjectDialog';
import { RenameDialog } from './dialogs/RenameDialog';
import { loadExampleProject } from './example';
import { ProjectPreview } from './ProjectPreview';
import { useProjectList } from './useProjectList';

type DialogState =
  | { kind: 'none' }
  | { kind: 'new'; start: NewProjectStart }
  | { kind: 'rename'; project: ProjectMeta }
  | { kind: 'delete'; project: ProjectMeta }
  | { kind: 'import'; result?: ImportResult; error?: ImportError };

/** P-01 Projects (docs/05 § 2, docs/07 § 2): list, first run (T-01), import (T-11), dialogs D-01…D-03. */
export function ProjectsPage() {
  const { t } = useTranslation('projects');
  const { repository } = useServices();
  const navigate = useNavigate();
  const list = useProjectList();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const exportProject = async (id: string) => {
    const project = await repository.get(id);
    if (!project) return;
    downloadBlob(exportBlob(project), exportFileName(project));
    await repository.recordExport();
    await list.refresh();
  };

  const exportAll = async () => {
    for (const meta of list.projects) await exportProject(meta.id);
  };

  const create = async (name: string, start: NewProjectStart) => {
    const project: Project =
      start === 'example' ? await loadExampleProject(name) : createProject(name);
    await repository.save(project);
    setDialog({ kind: 'none' });
    navigate(`/p/${project.id}`);
  };

  const importFile = async (file: File) => {
    try {
      const known = new Set(list.projects.map((p) => p.id));
      const result = prepareImport(await file.text(), (id) => known.has(id));
      await repository.save(result.project);
      await list.refresh();
      setDialog({ kind: 'import', result });
    } catch (error) {
      if (!(error instanceof ImportError)) throw error;
      setDialog({ kind: 'import', error });
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void importFile(file);
  };

  const firstProjectAt = list.projects.map((p) => p.createdAt).sort()[0];
  const backupDue = needsBackupReminder(list.backup, firstProjectAt, new Date().toISOString());
  const totalBytes = list.projects.reduce((sum, p) => sum + p.sizeBytes, 0);
  const hasProjects = list.status === 'ready' && list.projects.length > 0;

  return (
    <Page>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop import is a pointer shortcut; the "Import JSON" button is the accessible path */}
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="import-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void importFile(file);
          }}
        />

        {list.status === 'ready' && !hasProjects ? (
          <FirstRun
            onImport={() => fileInput.current?.click()}
            onExample={() => setDialog({ kind: 'new', start: 'example' })}
            onCreate={() => setDialog({ kind: 'new', start: 'empty' })}
          />
        ) : null}

        {hasProjects ? (
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-12 py-8 max-md:px-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="m-0 text-title-lg font-semibold">{t('title')}</h1>
              <div className="grow" />
              <Button onClick={() => fileInput.current?.click()}>{t('actions.importJson')}</Button>
              <Button variant="primary" onClick={() => setDialog({ kind: 'new', start: 'empty' })}>
                {t('actions.newProject')}
              </Button>
            </div>

            {!list.storage.persisted ? (
              <Banner
                kind="warning"
                actions={
                  <Button
                    size="sm"
                    onClick={async () => {
                      await requestPersistence();
                      await list.refresh();
                    }}
                  >
                    {t('banner.keepPersistent')}
                  </Button>
                }
              >
                {t('banner.notPersistent')}
              </Banner>
            ) : null}
            {backupDue ? (
              <Banner
                kind="warning"
                actions={
                  <Button size="sm" variant="primary" onClick={() => void exportAll()}>
                    {t('banner.exportAll')}
                  </Button>
                }
              >
                {list.backup.lastExportAt
                  ? t('banner.backupDue', {
                      days: Math.floor(
                        (Date.now() - Date.parse(list.backup.lastExportAt)) / 86_400_000,
                      ),
                    })
                  : t('banner.backupNever')}
              </Banner>
            ) : null}

            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 p-0">
              {list.projects.map((project) => (
                <li key={project.id}>
                  <ProjectCard
                    project={project}
                    onRename={() => setDialog({ kind: 'rename', project })}
                    onDuplicate={async () => {
                      await repository.duplicate(project.id, t('copyName', { name: project.name }));
                      await list.refresh();
                    }}
                    onExport={() => void exportProject(project.id)}
                    onDelete={() => setDialog({ kind: 'delete', project })}
                  />
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => setDialog({ kind: 'new', start: 'empty' })}
                  className="flex h-full min-h-60 w-full flex-col items-center justify-center gap-2.5 rounded-md border border-dashed border-border-strong text-text-secondary hover:bg-tile"
                >
                  <Plus size={28} aria-hidden="true" />
                  {t('actions.newProject')}
                </button>
              </li>
            </ul>

            <footer className="mt-auto flex flex-wrap gap-4 border-t border-border-subtle pt-3.5 font-mono text-data text-text-muted">
              <span>
                {t('footer.stored', { count: list.projects.length, size: formatKb(totalBytes) })} ·{' '}
                {list.storage.persisted ? t('footer.persistent') : t('footer.notPersistent')}
              </span>
            </footer>
          </div>
        ) : null}

        {dragging ? (
          <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-md border-2 border-dashed border-selection bg-accent-subtle/80 text-title font-semibold">
            {t('dropHint')}
          </div>
        ) : null}
      </div>

      {dialog.kind === 'new' ? (
        <NewProjectDialog
          open
          initialStart={dialog.start}
          onOpenChange={(open) => !open && setDialog({ kind: 'none' })}
          onCreate={(name, start) => void create(name, start)}
        />
      ) : null}
      {dialog.kind === 'rename' ? (
        <RenameDialog
          initialName={dialog.project.name}
          onClose={() => setDialog({ kind: 'none' })}
          onRename={async (name) => {
            await repository.rename(dialog.project.id, name);
            setDialog({ kind: 'none' });
            await list.refresh();
          }}
        />
      ) : null}
      {dialog.kind === 'delete' ? (
        <DeleteDialog
          name={dialog.project.name}
          onClose={() => setDialog({ kind: 'none' })}
          onExport={() => void exportProject(dialog.project.id)}
          onDelete={async () => {
            await repository.delete(dialog.project.id);
            setDialog({ kind: 'none' });
            await list.refresh();
          }}
        />
      ) : null}
      {dialog.kind === 'import' ? (
        <ImportResultDialog
          {...(dialog.result ? { result: dialog.result } : {})}
          {...(dialog.error ? { error: dialog.error } : {})}
          onClose={() => setDialog({ kind: 'none' })}
          onOpen={(id) => navigate(`/p/${id}`)}
        />
      ) : null}
    </Page>
  );
}

function FirstRun({
  onImport,
  onExample,
  onCreate,
}: {
  onImport: () => void;
  onExample: () => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation('projects');
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-130 flex-col items-center gap-4 text-center">
        <h1 className="m-0 text-title-lg font-semibold">{t('firstRun.title')}</h1>
        <p className="m-0 leading-normal text-text-secondary">{t('firstRun.description')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onImport}>{t('firstRun.import')}</Button>
          <Button onClick={onExample}>{t('firstRun.example')}</Button>
          <Button variant="primary" onClick={onCreate}>
            {t('firstRun.create')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
}: {
  project: ProjectMeta;
  onRename: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('projects');
  const navigate = useNavigate();
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-md border border-border-default bg-panel">
      <ProjectPreview preview={project.preview} />
      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-center gap-2">
          <Link
            to={`/p/${project.id}`}
            className="min-w-0 truncate font-semibold text-text-primary no-underline hover:underline"
          >
            {project.name}
          </Link>
          <div className="grow" />
          <Menu
            trigger={
              <button
                type="button"
                aria-label={t('actions.projectActions', { name: project.name })}
                className="flex size-7 items-center justify-center rounded-md text-text-secondary hover:bg-tile-header"
              >
                <MoreHorizontal size={16} aria-hidden="true" />
              </button>
            }
            items={[
              { label: t('actions.open'), onSelect: () => navigate(`/p/${project.id}`) },
              { label: t('actions.rename'), onSelect: onRename },
              { label: t('actions.duplicate'), onSelect: onDuplicate },
              { label: t('actions.exportJson'), onSelect: onExport },
              { label: t('actions.delete'), onSelect: onDelete, danger: true },
            ]}
          />
        </div>
        <span className="font-mono text-data-sm text-text-secondary">
          {t('card.meta', { devices: project.deviceCount, locations: project.locationCount })}
        </span>
        <span className="text-body-sm text-text-muted">
          {t('card.edited', { when: formatRelative(project.updatedAt) })}
        </span>
      </div>
    </article>
  );
}
