import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../../app/services';
import type { BackupState, ProjectMeta } from '../../persistence/db';
import { getStorageStatus, type StorageStatus } from '../../persistence/storage';

export interface ProjectListState {
  status: 'loading' | 'ready' | 'error';
  projects: ProjectMeta[];
  backup: BackupState;
  storage: StorageStatus;
}

/** Projects list + storage/backup status for P-01; `refresh` after every mutation. */
export function useProjectList() {
  const { repository } = useServices();
  const [state, setState] = useState<ProjectListState>({
    status: 'loading',
    projects: [],
    backup: { changesSinceExport: 0 },
    storage: { persisted: false },
  });

  const refresh = useCallback(async () => {
    try {
      const [projects, backup, storage] = await Promise.all([
        repository.list(),
        repository.getBackupState(),
        getStorageStatus(),
      ]);
      setState({ status: 'ready', projects, backup, storage });
    } catch {
      setState((s) => ({ ...s, status: 'error' }));
    }
  }, [repository]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
