import { create } from 'zustand';

/** Canvas selection (uiStore part, docs/03 § 4.2). Synced to `?sel=` by the editor (docs/07 § 0). */
export interface SelectionState {
  nodeIds: string[];
  edgeIds: string[];
  set(nodeIds: string[], edgeIds?: string[]): void;
  clear(): void;
}

export const useSelection = create<SelectionState>((set) => ({
  nodeIds: [],
  edgeIds: [],
  set: (nodeIds, edgeIds = []) => set({ nodeIds, edgeIds }),
  clear: () => set({ nodeIds: [], edgeIds: [] }),
}));
