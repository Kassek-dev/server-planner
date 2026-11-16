import { FileCheck2, FileWarning, X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { useServices } from '../../app/services';
import {
  fileAccessSupported,
  getFileLink,
  type LinkState,
  saveToNewFile,
  syncLinkedFile,
  unlinkFile,
} from '../../persistence/fileLink';

/** PRJ-09 file link of the open project: its name and whether the last write went through. */
export const useFileLink = create<{
  projectId: string | null;
  name: string | null;
  state: LinkState | null;
  set(
    next: Partial<{ projectId: string | null; name: string | null; state: LinkState | null }>,
  ): void;
}>((set) => ({
  projectId: null,
  name: null,
  state: null,
  set: (next) => set(next),
}));

/** Loads the link of the open project and writes the file after every autosave. */
export function useFileLinkSync(projectId: string) {
  const { repository, session } = useServices();
  useEffect(() => {
    if (!fileAccessSupported() || !projectId) return;
    let cancelled = false;
    useFileLink.getState().set({ projectId, name: null, state: null });
    void getFileLink(repository, projectId).then((link) => {
      if (!cancelled && link) useFileLink.getState().set({ name: link.name, state: 'synced' });
    });
    const unsubscribe = session.subscribe((state, previous) => {
      if (state.saveState !== 'saved' || previous.saveState === 'saved') return;
      if (!useFileLink.getState().name || !state.project) return;
      void syncLinkedFile(repository, state.project).then((result) => {
        if (!cancelled && result) useFileLink.getState().set({ state: result });
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectId, repository, session]);
}

/** "Save to file…" (palette, project summary): links the open project to a file on disk. */
export async function saveProjectToFile(services: ReturnType<typeof useServices>): Promise<void> {
  const { repository, session } = services;
  await session.flush();
  const project = session.getState().project;
  if (!project) return;
  const link = await saveToNewFile(repository, project);
  if (link) useFileLink.getState().set({ projectId: project.id, name: link.name, state: 'synced' });
}

/** Top bar chip: the linked file; asks for the permission again when the browser dropped it. */
export function FileLinkIndicator() {
  const { t } = useTranslation('editor');
  const services = useServices();
  const { name, state, projectId } = useFileLink();
  if (!name || !projectId) return null;
  const project = services.session.getState().project;
  const reconnect = async () => {
    if (!project) return;
    const result = await syncLinkedFile(services.repository, project, true);
    if (result) useFileLink.getState().set({ state: result });
  };
  const ok = state === 'synced';
  return (
    <span className="flex items-center gap-1 text-body-sm whitespace-nowrap text-text-muted">
      <button
        type="button"
        onClick={ok ? undefined : () => void reconnect()}
        title={ok ? t('file.synced', { name }) : t('file.reconnect', { name })}
        aria-label={ok ? t('file.synced', { name }) : t('file.reconnect', { name })}
        className={`flex max-w-36 items-center gap-1 truncate rounded-sm px-1 ${ok ? 'cursor-default' : 'text-warning-text hover:underline'}`}
      >
        {ok ? (
          <FileCheck2 size={14} aria-hidden="true" />
        ) : (
          <FileWarning size={14} aria-hidden="true" />
        )}
        <span className="truncate max-2xl:sr-only">{name}</span>
      </button>
      <button
        type="button"
        className="rounded-sm px-1 hover:text-text-primary"
        aria-label={t('file.unlink', { name })}
        title={t('file.unlink', { name })}
        onClick={() =>
          void unlinkFile(services.repository, projectId).then(() =>
            useFileLink.getState().set({ name: null, state: null }),
          )
        }
      >
        <X size={12} aria-hidden="true" />
      </button>
    </span>
  );
}
