import {
  applyPatches,
  type Command,
  CommandError,
  type CommandResult,
  defaultContext,
  execute,
  type ModelContext,
  type Patch,
  type Project,
} from '@server-planner/model';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ProjectRepository } from '../persistence/repository';

/**
 * Editing session of one project — projectStore + historyStore from docs/03 § 4.2–4.4.
 * Every change goes through a model command; history keeps Immer patches; autosave is debounced.
 */

export interface HistoryEntry {
  /** Command name, e.g. `device.add` — shown as "Undo device.add" (translated in UI). */
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
  /** Consecutive commands with the same key within `mergeWindowMs` collapse into one step. */
  mergeKey?: string;
  at: number;
}

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

export interface ProjectSessionState {
  project: Project | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  saveState: SaveState;
  lastError: CommandError | null;
}

export interface DispatchOptions {
  mergeKey?: string;
}

export interface ProjectSession extends StoreApi<ProjectSessionState> {
  load(project: Project): void;
  clear(): Promise<void>;
  dispatch<P, R>(command: Command<P, R>, payload: P, options?: DispatchOptions): R;
  /** Runs several commands as one undo step; nothing changes if any of them is rejected. */
  transaction<T>(label: string, fn: (run: <P, R>(command: Command<P, R>, payload: P) => R) => T): T;
  undo(): boolean;
  redo(): boolean;
  /** Writes pending changes immediately (navigation, export, page hide). */
  flush(): Promise<void>;
}

export interface ProjectSessionOptions {
  repository: Pick<ProjectRepository, 'save' | 'recordChangeSaved'>;
  ctx?: ModelContext;
  autosaveMs?: number;
  historyLimit?: number;
  mergeWindowMs?: number;
  clock?: () => number;
}

export function createProjectSession({
  repository,
  ctx = defaultContext,
  autosaveMs = 1000,
  historyLimit = 200,
  mergeWindowMs = 500,
  clock = Date.now,
}: ProjectSessionOptions): ProjectSession {
  const store = createStore<ProjectSessionState>(() => ({
    project: null,
    past: [],
    future: [],
    saveState: 'saved',
    lastError: null,
  }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> = Promise.resolve();

  const save = async () => {
    timer = undefined;
    const { project } = store.getState();
    if (!project) return;
    store.setState({ saveState: 'saving' });
    try {
      await repository.save(project);
      await repository.recordChangeSaved();
      // A newer change may have been scheduled while we were writing.
      store.setState({ saveState: timer ? 'pending' : 'saved' });
    } catch {
      store.setState({ saveState: 'error' });
    }
  };

  const scheduleSave = () => {
    store.setState({ saveState: 'pending' });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      saving = saving.then(save);
    }, autosaveMs);
  };

  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      saving = saving.then(save);
    }
    await saving;
  };

  /** Set after undo/redo so the next command never merges into an older step. */
  let mergeBlocked = false;

  function dispatch<P, R>(command: Command<P, R>, payload: P, options: DispatchOptions = {}): R {
    const { project, past } = store.getState();
    if (!project) throw new Error('No project loaded');
    let out: CommandResult<R>;
    try {
      out = execute(project, command, payload, ctx);
    } catch (error) {
      if (error instanceof CommandError) store.setState({ lastError: error });
      throw error;
    }
    const now = clock();
    const last = past.at(-1);
    const merge =
      !mergeBlocked &&
      options.mergeKey !== undefined &&
      last?.mergeKey === options.mergeKey &&
      now - last.at <= mergeWindowMs;
    mergeBlocked = false;
    const entry: HistoryEntry = merge
      ? {
          ...last,
          patches: [...last.patches, ...out.patches],
          inversePatches: [...out.inversePatches, ...last.inversePatches],
          at: now,
        }
      : {
          label: command.name,
          patches: out.patches,
          inversePatches: out.inversePatches,
          at: now,
          ...(options.mergeKey !== undefined ? { mergeKey: options.mergeKey } : {}),
        };
    const nextPast = merge ? [...past.slice(0, -1), entry] : [...past, entry];
    store.setState({
      project: out.project,
      past: nextPast.slice(-historyLimit),
      future: [],
      lastError: null,
    });
    scheduleSave();
    return out.result;
  }

  function transaction<T>(
    label: string,
    fn: (run: <P, R>(command: Command<P, R>, payload: P) => R) => T,
  ): T {
    const start = store.getState().project;
    if (!start) throw new Error('No project loaded');
    let working = start;
    const patches: Patch[] = [];
    let inversePatches: Patch[] = [];
    let result: T;
    try {
      result = fn((command, payload) => {
        const out = execute(working, command, payload, ctx);
        working = out.project;
        patches.push(...out.patches);
        inversePatches = [...out.inversePatches, ...inversePatches];
        return out.result;
      });
    } catch (error) {
      if (error instanceof CommandError) store.setState({ lastError: error });
      throw error;
    }
    if (patches.length === 0) return result;
    mergeBlocked = false;
    const { past } = store.getState();
    store.setState({
      project: working,
      past: [...past, { label, patches, inversePatches, at: clock() }].slice(-historyLimit),
      future: [],
      lastError: null,
    });
    scheduleSave();
    return result;
  }

  return {
    ...store,

    load(project) {
      if (timer) clearTimeout(timer);
      timer = undefined;
      store.setState({ project, past: [], future: [], saveState: 'saved', lastError: null });
    },

    async clear() {
      await flush();
      store.setState({ project: null, past: [], future: [], saveState: 'saved', lastError: null });
    },

    dispatch,
    transaction,

    undo() {
      const { project, past, future } = store.getState();
      const entry = past.at(-1);
      if (!project || !entry) return false;
      store.setState({
        project: applyPatches(project, entry.inversePatches),
        past: past.slice(0, -1),
        future: [...future, { ...entry, at: clock() }],
      });
      mergeBlocked = true;
      scheduleSave();
      return true;
    },

    redo() {
      const { project, past, future } = store.getState();
      const entry = future.at(-1);
      if (!project || !entry) return false;
      // A redone step must never merge with the next command.
      store.setState({
        project: applyPatches(project, entry.patches),
        past: [...past, { ...entry, at: clock() }],
        future: future.slice(0, -1),
      });
      mergeBlocked = true;
      scheduleSave();
      return true;
    },

    flush,
  };
}
