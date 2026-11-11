import { create } from 'zustand';

/** Canvas selection (uiStore part, docs/03 § 4.2). Synced to `?sel=` by the editor (docs/07 § 0). */
/** Something inside a device that is not a canvas node (workload or app) — shown in the inspector. */
export type SelectionDetail = { type: 'workload' | 'app'; id: string };

export interface SelectionState {
  nodeIds: string[];
  edgeIds: string[];
  detail: SelectionDetail | null;
  set(nodeIds: string[], edgeIds?: string[]): void;
  setDetail(detail: SelectionDetail | null): void;
  clear(): void;
}

export const useSelection = create<SelectionState>((set) => ({
  nodeIds: [],
  edgeIds: [],
  detail: null,
  set: (nodeIds, edgeIds = []) => set({ nodeIds, edgeIds, detail: null }),
  setDetail: (detail) => set({ detail }),
  clear: () => set({ nodeIds: [], edgeIds: [], detail: null }),
}));
