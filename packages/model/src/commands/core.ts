import { enablePatches, type Patch, produceWithPatches } from 'immer';
import { defaultContext, type ModelContext } from '../factories';
import type { Project } from '../schema/project';

enablePatches();

/** Re-exported so apps apply history patches without depending on Immer directly. */
export { applyPatches, type Patch } from 'immer';

/**
 * Command layer — docs/03-architektura.md § 4.3.
 * Every project change is a named, pure function on an Immer draft. UI never mutates state directly.
 */
export interface Command<P, R = void> {
  readonly name: string;
  run(draft: Project, payload: P, ctx: ModelContext): R;
}

export const defineCommand = <P, R = void>(
  name: string,
  run: (draft: Project, payload: P, ctx: ModelContext) => R,
): Command<P, R> => ({ name, run });

/** Thrown when a command is rejected; `code`/`params` are translated in the UI (Z7). */
export class CommandError extends Error {
  readonly code: string;
  readonly params: Readonly<Record<string, string | number>>;

  constructor(code: string, params: Record<string, string | number> = {}) {
    super(`${code} ${JSON.stringify(params)}`);
    this.name = 'CommandError';
    this.code = code;
    this.params = params;
  }
}

export interface CommandResult<R> {
  project: Project;
  result: R;
  /** Forward patches — history redo. */
  patches: Patch[];
  /** Inverse patches — history undo (docs/03 § 4.4). */
  inversePatches: Patch[];
}

/** Runs a command and returns the next immutable project with undo/redo patches. */
export function execute<P, R>(
  project: Project,
  command: Command<P, R>,
  payload: P,
  ctx: ModelContext = defaultContext,
): CommandResult<R> {
  let result: R | undefined;
  const [next, patches, inversePatches] = produceWithPatches(project, (draft) => {
    result = command.run(draft as Project, payload, ctx);
    draft.updatedAt = ctx.now();
  });
  return { project: next, result: result as R, patches, inversePatches };
}

/** Returns the entity or throws `NOT_FOUND`. */
export function getOrThrow<T>(map: Record<string, T>, id: string, entity: string): T {
  const value = map[id];
  if (value === undefined) throw new CommandError('NOT_FOUND', { entity, id });
  return value;
}

/** Applies a partial update; `undefined` removes the key (exactOptionalPropertyTypes-friendly). */
export function applyChanges<T extends object>(target: T, changes: Partial<T>): void {
  const record = target as Record<string, unknown>;
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete record[key];
    else record[key] = value;
  }
}

/** `Omit` that distributes over unions (keeps discriminated unions intact). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
